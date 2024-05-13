import { CameraType, IImage, SensorData } from 'types';
import { DraftFrameKm } from './draftFrameKm';
import { isGnss, isImage, isImu } from 'util/sensor';
import { isGoodQualityGnssRecord } from 'util/gnss';
import { FrameKM, GnssRecord, ImuRecord } from 'types/sqlite';
import { timeIsMostLikelyLight } from 'util/daylight';
import {
  addFramesToFrameKm,
  deleteFrame,
  deleteFrameKm,
  getExistingFramesMetadata,
  getFirstFrameKmId,
  getFirstPostponedFrameKm,
  getFirstRecord,
  getFrameKm,
  getFrameKmName,
  getFrameKmsCount,
  getLastFrameKmId,
  getLastTimestamp,
  getPostponedEndTrim,
  ignoreTrimStart,
  isFrameKmComplete,
  moveFrameKmBackToQueue,
  postponeEndTrim,
  restoreEndTrim,
} from 'sqlite/framekm';
import { getLatestGnssTime, isTimeSet } from 'util/lock';
import { isIntegrityCheckDone } from 'services/integrityCheck';
import { isPrivateZonesInitialised } from 'services/loadPrivacy';
import { isImuValid } from 'util/imu';
import { GnssFilter } from 'types/motionModel';
import { exec, spawnSync } from 'child_process';
import {
  CAMERA_TYPE,
  DATA_LOGGER_SERVICE,
  FOLDER_PURGER_SERVICE,
  FRAMES_ROOT_FOLDER,
} from 'config';
import { promises } from 'fs';
import { Instrumentation } from 'util/instrumentation';
import { getConfig, getDX, setConfig } from 'sqlite/config';
import { getServiceStatus, setServiceStatus } from 'sqlite/health_state';

let sessionTrimmed = false;

export class DriveSession {
  startedAt = new Date();
  frameKmsToProcess: DraftFrameKm[] = [];
  draftFrameKm: DraftFrameKm | null = null;
  trimDistance: number;
  started = false;

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

    const { GnssFilter, MaxPendingTime } = await getConfig(['GnssFilter', 'MaxPendingTime']);

    for (const data of sensorData) {
      if (!this.dataIsGoodEnough(data, GnssFilter, MaxPendingTime)) {
        continue;
      }

      if (!this.draftFrameKm) {
        this.draftFrameKm = new DraftFrameKm(data);
        continue;
      }

      const added = this.draftFrameKm.maybeAdd(data);
      if (!added) {
        this.frameKmsToProcess.push(this.draftFrameKm);
        this.draftFrameKm = new DraftFrameKm(data);
      }
    }
  }

  async start() {
    const lastTimeIterated = await getConfig('lastTimeIterated');
    const now = getLatestGnssTime();
    if (lastTimeIterated && Math.abs(now - lastTimeIterated) < 1000 * 60 * 4) {
      await restoreEndTrim();
      ignoreTrimStart();
      Instrumentation.add({
        event: 'DashcamReboot',
        size: Math.abs(now - lastTimeIterated)
      })
    } else {
      // trim last framekm (end trip trimming)
      const frameKmToTrim = await getPostponedEndTrim();
      const TrimDistance = await getConfig('TrimDistance');
      const DX = getDX();

      const framesToTrim = Math.min(Math.round(TrimDistance / DX), frameKmToTrim.length);

      for (let i = 0; i < framesToTrim; i++) {
        const frameToRemove = frameKmToTrim.pop();
        if (frameToRemove?.image_name) {
          await deleteFrame(frameToRemove.image_name, frameToRemove.image_path || '');
        }
      }
      await restoreEndTrim();
    }
    this.started = true;
  }

  async getSamplesAndSyncWithDb() {
    // get prev frames for proper frame stitching
    const prevKeyFrames = await getExistingFramesMetadata();
    const isContinuous = !this.frameKmsToProcess.length;
    for (let i = 0; i < this.frameKmsToProcess.length; i++) {
      const curFrameKm = this.frameKmsToProcess[i];
      const newFrames = curFrameKm.getEvenlyDistancedFramesFromSensorData(
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

    // what's up with current draft
    const newFrames =
      this.draftFrameKm?.getEvenlyDistancedFramesFromSensorData(
        isContinuous ? prevKeyFrames : [],
      ) || [];
    if (newFrames.length > 1) {
      // can potentially add to separate FrameKMs
      await addFramesToFrameKm(newFrames, !isContinuous);
      const lastGpsElem = this.draftFrameKm?.getGpsData()?.pop();
      this.draftFrameKm = new DraftFrameKm(lastGpsElem);
    } else {
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
      const isGoodEnough = isGoodQualityGnssRecord(gnss, gnssFilter) &&
        timeIsMostLikelyLight(
          new Date(gnss.time),
          gnss.longitude,
          gnss.latitude,
        );
      const now = getLatestGnssTime();
      if (now) {
        return isGoodEnough && gnss.time > now - maxPendingTime
      } else {
        return isGoodEnough;
      }
    } else if (isImu(data)) {
      return isImuValid(data as ImuRecord);
    } else if (isImage(data)) {
      return (data as IImage).image_name !== undefined;
    } else {
      return false;
    }
  }

  ready() {
    return isTimeSet() && isIntegrityCheckDone() && isPrivateZonesInitialised();
  }

  async getLastTime() {
    const now = getLatestGnssTime();
    if (this.draftFrameKm && !this.draftFrameKm.isEmpty()) {
      return Math.max(this.draftFrameKm.getLastTime(), now - 60 * 1000);
    }
    const date = await getLastTimestamp();
    return Math.max(date, now - 60 * 1000);
  }

  async getNextFrameKMToProcess(ignorePostponed = false): Promise<FrameKM | null> {
    const isDashcamMLEnabled = await getConfig('isDashcamMLEnabled');
    if (await isFrameKmComplete(isDashcamMLEnabled)) {
      const fkmId = await getFirstFrameKmId(isDashcamMLEnabled);
      return await getFrameKm(fkmId);
    } else {
      const isTripTrimmingEnabled = await getConfig('isTripTrimmingEnabled');

      if (!sessionTrimmed && isTripTrimmingEnabled) {
        // END TRIP TRIMMING
        console.log('Postponing last framekm for trip trimming (need to wait for time)');
        sessionTrimmed = true;
        const fkm_id = await getLastFrameKmId();
        console.log('FrameKM to trim', fkm_id);
        if (fkm_id) {
          await postponeEndTrim(fkm_id);
        }
        return null;
      }

      if (isDashcamMLEnabled && !ignorePostponed) {
        const firstPostponed = await getFirstPostponedFrameKm();
        if (firstPostponed) {
          await moveFrameKmBackToQueue(firstPostponed);
          const name = await getFrameKmName(firstPostponed);
          console.log('Moving back to the queue: ', name);
          Instrumentation.add({
            event: 'DashcamScheduledFrameKmToReprocess',
            message: JSON.stringify({
              name
            }),
          });
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

  lastCheckedKmId: number | null = null;
  lastCheckedFrameKmSize: number | null = null;
  countFaultyIterations = 0;

  async doHealthCheck() {
    try {
      const firstRecord = await getFirstRecord();
      const firstKmId = firstRecord?.fkm_id;
      const framekms = await getFrameKmsCount(false);
      if (!this.lastCheckedFrameKmSize) {
        this.lastCheckedFrameKmSize = framekms;
      }
      if (framekms > this.lastCheckedFrameKmSize && firstKmId) {
        this.lastCheckedFrameKmSize = framekms;
        // FrameKM table is growing
        if (!this.lastCheckedKmId) {
          this.lastCheckedKmId = firstKmId;
        } else if (firstKmId === this.lastCheckedKmId) {
          // but first FrameKM to be processed stays the same
          this.countFaultyIterations++;
          if (this.countFaultyIterations > 15) {
            // processing stuck, need to delete first framekm to unblock
            this.countFaultyIterations = 0;
            await deleteFrameKm(firstKmId);
            Instrumentation.add({
              event: 'DashcamUnblocked',
              message: JSON.stringify({ 
                count: framekms,
                firstId: firstKmId,
               }),
            });
            exec('systemctl restart object-detection');
          }
        } else {
          this.countFaultyIterations = 0;
          this.lastCheckedKmId = firstKmId;
        }
      }
      const now = getLatestGnssTime();
      if (now) {
        await setConfig('lastTimeIterated', now); 
      }
    } catch (e: unknown) {
      console.log('Error during health check:', e);
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
