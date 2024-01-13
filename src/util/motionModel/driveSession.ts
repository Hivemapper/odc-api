import { CameraType, IImage, SensorData } from 'types';
import { DraftFrameKm } from './draftFrameKm';
import { isGnss, isImage, isImu } from 'util/sensor';
import { isGoodQualityGnssRecord } from 'util/gnss';
import { FrameKM, GnssRecord, ImuRecord } from 'types/sqlite';
import { timeIsMostLikelyLight } from 'util/daylight';
import {
  addFramesToFrameKm,
  getExistingFramesMetadata,
  getFirstFrameKmId,
  getFrameKm,
  getLastTimestamp,
  isFrameKmComplete,
} from 'sqlite/framekm';
import { ifTimeSet } from 'util/lock';
import { isIntegrityCheckDone } from 'services/integrityCheck';
import { isPrivateZonesInitialised } from 'services/loadPrivacy';
import { isImuValid } from 'util/imu';
import { distance } from 'util/geomath';
import { GnssFilter } from 'types/motionModel';
import { LatLon } from 'types/motionModel';
import { exec, spawnSync } from 'child_process';
import {
  CAMERA_TYPE,
  DATA_LOGGER_SERVICE,
  FOLDER_PURGER_SERVICE,
  FRAMES_ROOT_FOLDER,
} from 'config';
import { promises } from 'fs';
import { Instrumentation } from 'util/instrumentation';
import { getConfig } from 'sqlite/config';
import { getServiceStatus, setServiceStatus } from 'sqlite/health_state';

let sessionTrimmed = false;

export class DriveSession {
  startedAt = new Date();
  frameKmsToProcess: DraftFrameKm[] = [];
  draftFrameKm: DraftFrameKm | null = null;
  trimDistance: number;

  constructor(trimDistance = 100) {
    this.trimDistance = trimDistance;
  }

  async ingestData(gnss: GnssRecord[], imu: ImuRecord[], images: IImage[]) {
    // check if no sensor data is missing — otherwise repair services
    this.checkForMissingSensorData(gnss, imu, images);

    if (!images.length || !gnss.length) {
      // doesn't make sense to add any data if there's no images or gnss records for the time snippet
      return;
    }

    // Combine sensor data to be able to split them on chunks based on system time
    const sensorData: SensorData[] = (gnss as SensorData[])
      .concat(imu)
      .concat(images)
      .filter(s => s)
      .sort((a, b) => a.system_time - b.system_time);

    const { GnssFilter, MaxPendingTime, DX } = await getConfig(['GnssFilter', 'MaxPendingTime', 'DX']);

    for (const data of sensorData) {
      if (!this.dataIsGoodEnough(data, GnssFilter, MaxPendingTime)) {
        continue;
      }

      if (!this.draftFrameKm) {
        this.draftFrameKm = new DraftFrameKm(data, DX);
        continue;
      }

      const added = this.draftFrameKm.maybeAdd(data, DX);
      if (!added) {
        this.frameKmsToProcess.push(this.draftFrameKm);
        this.draftFrameKm = new DraftFrameKm(data, DX);
      }
    }
    if (this.draftFrameKm) {
      console.log('Data in draft: ', this.draftFrameKm.getData().length);
    }
  }

  async getSamplesAndSyncWithDb() {
    // get prev frames for proper frame stitching
    console.log('traversing full packages');
    const prevKeyFrames = await getExistingFramesMetadata();
    const isContinuous = !this.frameKmsToProcess.length;
    for (let i = 0; i < this.frameKmsToProcess.length; i++) {
      const curFrameKm = this.frameKmsToProcess[i];
      const newFrames = await curFrameKm.getEvenlyDistancedFramesFromSensorData(
        i === 0 ? prevKeyFrames : [],
      );
      if (newFrames.length) {
        // can potentially add to separate FrameKMs
        if (i === 0 || newFrames.length > 3) {
          await addFramesToFrameKm(newFrames, i > 0);
        }
      }
    }
    this.frameKmsToProcess = [];

    console.log('traversing draft');
    // what's up with current draft
    const newFrames =
      await this.draftFrameKm?.getEvenlyDistancedFramesFromSensorData(
        isContinuous ? prevKeyFrames : [],
      ) || [];
    if (newFrames.length > 1) {
      // can potentially add to separate FrameKMs
      await addFramesToFrameKm(newFrames, !isContinuous);
      const lastGpsElem = this.draftFrameKm?.getGpsData()?.pop();
      console.log(
        'last gps to consider: ',
        distance(
          newFrames[newFrames.length - 1] as LatLon,
          lastGpsElem as LatLon,
        ),
        lastGpsElem?.time,
      );
      const DX = await getConfig('DX');
      this.draftFrameKm = new DraftFrameKm(lastGpsElem, DX);
    } else {
      console.log('Not enough frames to add yet, ', newFrames.length);
      if (this.draftFrameKm) {
        if (this.draftFrameKm.getData().length > 100000) {
          console.log('SANITIZING THE DATA');
          this.draftFrameKm.clearData();
          this.draftFrameKm = null;
        }
      }
    }
  }

  dataIsGoodEnough(data: SensorData, gnssFilter: GnssFilter, maxPendingTime: number) {
    if (isGnss(data)) {
      const gnss: GnssRecord = data as GnssRecord;

      return (
        isGoodQualityGnssRecord(gnss, gnssFilter) &&
        timeIsMostLikelyLight(
          new Date(gnss.time),
          gnss.longitude,
          gnss.latitude,
        ) &&
        gnss.time > Date.now() - maxPendingTime
      );
    } else if (isImu(data)) {
      return isImuValid(data as ImuRecord);
    } else if (isImage(data)) {
      return (data as IImage).image_name !== undefined;
    } else {
      return false;
    }
  }

  ready() {
    return ifTimeSet() && isIntegrityCheckDone() && isPrivateZonesInitialised();
  }

  async getLastTime() {
    if (this.draftFrameKm && !this.draftFrameKm.isEmpty()) {
      return this.draftFrameKm.getLastTime();
    }
    return (await getLastTimestamp()) ?? this.startedAt;
  }

  async getNextFrameKMToProcess(): Promise<FrameKM | null> {
    if (await isFrameKmComplete()) {
      const fkmId = await getFirstFrameKmId();
      return await getFrameKm(fkmId);
    } else {
      const { isTripTrimmingEnabled, TrimDistance, DX } = await getConfig(['isTripTrimmingEnabled', 'TrimDistance', 'DX']);

      if (!sessionTrimmed && isTripTrimmingEnabled) {
        // END TRIP TRIMMING
        console.log('Trying to trim the end of the trip');
        sessionTrimmed = true;
        const fkm_id = await getFirstFrameKmId();
        console.log('FrameKM to trim', fkm_id);
        if (fkm_id) {
          const frameKmToTrim = await getFrameKm(fkm_id);
          const framesToTrim = Math.round(TrimDistance / DX);
          if (frameKmToTrim.length > framesToTrim) {
            return frameKmToTrim.slice(
              0,
              frameKmToTrim.length - Math.round(TrimDistance / DX),
            );
          } else {
            // @ts-ignore
            return [{ fkm_id }]; // return dummy element that will trigger the cleanup
          }
        } else {
          return null;
        }
      }
      return null;
    }
  }

  possibleImagerProblemCounter = 0;
  possibleGnssImuProblemCounter = 0;

  async checkForMissingSensorData(
    gnss: GnssRecord[],
    imu: ImuRecord[],
    images: IImage[],
  ) {
    if (!gnss.length || !imu.length) {
      this.possibleGnssImuProblemCounter++;
      if (this.possibleGnssImuProblemCounter === 3) {
        this.repairDataLogger();
        this.possibleGnssImuProblemCounter = 0;
      }
    } else {
      this.possibleGnssImuProblemCounter = 0;
    }

    if (!images.length) {
      this.possibleImagerProblemCounter++;
      if (this.possibleImagerProblemCounter === 3) {
        this.repairCameraBridge();
        this.possibleImagerProblemCounter = 0;
      }
    } else {
      this.possibleImagerProblemCounter = 0;
    }
  }

  repairDataLogger() {
    console.log('Repairing Data Logger');
    exec(`journalctl -eu ${DATA_LOGGER_SERVICE}`, (error, stdout, stderr) => {
      console.log(stdout || stderr);
      console.log('Restarting data-logger');
      exec(`systemctl restart ${DATA_LOGGER_SERVICE}`);
      Instrumentation.add({
        event: 'DashcamApiRepaired',
        message: JSON.stringify({ serviceRepaired: 'data-logger' }),
      });
    });
  }

  async checkObjectDetectionService() {
    try {
      // service should be active
      const result = spawnSync('systemctl', ['is-active', 'object-detection'], {
        encoding: 'utf-8',
      });
  
      if (result.error) {
        console.log('failed to check if camera running:', result.error);
        return false;
      }
      const res = result.stdout.trim();
      if (res !== 'active') {
        exec('systemctl restart object-detection');
        Instrumentation.add({
          event: 'DashcamApiRepaired',
          message: JSON.stringify({ serviceRepaired: 'object-detection' }),
        });
        return;
      }
    } catch (e) {
      console.log('failed to check if camera running:', e);
    }

    try {
      const status = await getServiceStatus('object-detection');
      if (status === 'failed') {
        await setServiceStatus('object-detection', 'restarting');
        exec('systemctl restart object-detection');
        Instrumentation.add({
          event: 'DashcamApiRepaired',
          message: JSON.stringify({ serviceRepaired: 'object-detection' }),
        });
      }
    } catch {
      //
    }
  }

  repairCameraBridge() {
    console.log('Repairing Camera Bridge');
    exec(`journalctl -eu camera-bridge`, async (error, stdout, stderr) => {
      console.log(stdout || stderr);
      console.log('Restarting Camera-Bridge');
      try {
        await promises.rm(FRAMES_ROOT_FOLDER, { recursive: true, force: true });
        console.log('Successfully cleaned folder');
      } catch (e: unknown) {
        console.log(e);
      }
      try {
        await promises.mkdir(FRAMES_ROOT_FOLDER, { recursive: true });
        console.log('Successfully re-created folder');
      } catch (e: unknown) {
        console.log(e);
      }
      let restartCmd = `systemctl restart ${FOLDER_PURGER_SERVICE} && systemctl restart camera-bridge`;
      if (CAMERA_TYPE === CameraType.HdcS) {
        restartCmd = 'systemctl restart jpeg-recorder && ' + restartCmd;
      }
      exec(restartCmd, (err, stout, sterr) => {
        console.log(stout || sterr);
        console.log('Successfully restarted Folder Purger & Camera Bridge');
        Instrumentation.add({
          event: 'DashcamApiRepaired',
          message: JSON.stringify({ serviceRepaired: 'camera-bridge' }),
        });
      });
    });
  }
}
