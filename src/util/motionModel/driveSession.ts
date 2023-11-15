import { IImage, SensorData } from 'types';
import { DraftFrameKm } from './draftFrameKm';
import { isGnss, isImage, isImu } from 'util/sensor';
import { isGoodQualityGnssRecord } from 'util/gnss';
import { GnssRecord, ImuRecord } from 'types/sqlite';
import { timeIsMostLikelyLight } from 'util/daylight';
import { getConfig } from './config';
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

export class DriveSession {
  startedAt = new Date();
  frameKmsToProcess: DraftFrameKm[] = [];
  draftFrameKm: DraftFrameKm | null = null;
  trimDistance: number;

  constructor(trimDistance = 100) {
    this.trimDistance = trimDistance;
  }

  ingestData(sensorData: SensorData[]) {
    for (const data of sensorData) {
      if (!this.dataIsGoodEnough(data)) {
        continue;
      }

      if (!this.draftFrameKm) {
        this.draftFrameKm = new DraftFrameKm(data);
        continue;
      }

      const added = this.draftFrameKm.maybeAdd(data);
      if (!added) {
        // need to cut
        this.frameKmsToProcess.push(this.draftFrameKm);
        this.draftFrameKm = new DraftFrameKm(data);
      }
    }
  }

  async getSamplesAndSyncWithDb() {
    // get prev frames for proper frame stitching
    const prevKeyFrames = await getExistingFramesMetadata();

    for (let i = 0; i < this.frameKmsToProcess.length; i++) {
      const curFrameKm = this.frameKmsToProcess[i];
      const newFrames = curFrameKm.getEvenlyDistancedFramesFromSensorData(i === 0 ? prevKeyFrames : []);
        if (newFrames.length) {
          // can potentially add to separate FrameKMs
          await addFramesToFrameKm(newFrames, i > 0);
          if (this.frameKmsToProcess.length === 1) {
            this.frameKmsToProcess = [];
            this.draftFrameKm = null;
          }
        }
    }
    this.frameKmsToProcess = [];
  }

  dataIsGoodEnough(data: SensorData) {
    if (isGnss(data)) {
      const gnss: GnssRecord = data as GnssRecord;
      return (
        isGoodQualityGnssRecord(gnss) &&
        timeIsMostLikelyLight(
          new Date(gnss.time),
          gnss.longitude,
          gnss.latitude,
        ) &&
        gnss.time > Date.now() - getConfig().MaxPendingTime
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

  async getNextFrameKMToProcess() {
    if (await isFrameKmComplete()) {
      const fkmId = await getFirstFrameKmId();
      return await getFrameKm(fkmId);
    } else {
      return null;
    }
  }

  doneProcessingFrameKM() {
    // remove FrameKM from table
  }
}
