import * as THREE from 'three';
import { IImage, SensorData } from 'types';
import { FrameKmRecord, GnssRecord, ImuRecord } from 'types/sqlite';
import { catmullRomCurve, distance, interpolate, latLonDistance } from 'util/geomath';
import { isGnss, isImage, isImu } from 'util/sensor';
import { MAX_SPEED, getConfig } from './config';

const MIN_DISTANCE_BETWEEN_POINTS = 1;
const MAX_ALLOWED_IMG_DROP = 300;

export class DraftFrameKm {
  data: SensorData[] = [];
  lastGnss: GnssRecord | null = null;
  lastImageTimestamp = 0;
  totalDistance = 0;

  constructor(data?: SensorData) {
    if (data) {
      this.maybeAdd(data);
    }
  }

  maybeAdd(data: SensorData): boolean {
    if (!this.data.length) {
      return true;
    }
    if (isGnss(data)) {
      if (!this.lastGnss) {
        // first GPS record, nothing to compare
        this.lastGnss = data as GnssRecord;
        this.data.push(data);
        return true;
      }
      const gnss = data as GnssRecord;
      const deltaTime = gnss.time - this.lastGnss.time;
      const distance = latLonDistance(
        gnss.latitude,
        gnss.longitude,
        this.lastGnss.latitude,
        this.lastGnss.longitude,
      );
      this.lastGnss = gnss;

      if (!deltaTime) {
        console.log('Potential error: GPS records with no time difference');
        return true;
      }
      const speed = distance / deltaTime;

      /**
       * Should we add this point, or is it too soon?
       */
      if (distance < MIN_DISTANCE_BETWEEN_POINTS) {
        // no need to add points being too close to each other
        return true;
      }

      /**
       * Should we add this point, or should we cut the FrameKM already?
       */
      if (speed > MAX_SPEED) {
        // too fast or GPS is not accurate, cut
        return false;
      }
      if (distance > getConfig().DX) {
        // travelled too far, cut
        return false;
      }
      this.totalDistance += distance;
      if (this.totalDistance > getConfig().FrameKmLengthMeters) {
        // KM is collected, can cut here
        this.data.push(data);
        return false;
      }
    } else if (isImage(data)) {
      if (!this.lastImageTimestamp) {
        this.lastImageTimestamp = data.system_time;
        this.data.push(data);
        return true;
      } else {
        const deltaTime = data.system_time - this.lastImageTimestamp;
        this.lastImageTimestamp = data.system_time;

        if (deltaTime > MAX_ALLOWED_IMG_DROP) {
          return false;
        }
        this.data.push(data);
        return true;
      }
    } else {
      this.data.push(data);
      return true;
    }

    this.data.push(data);
    return true;
  }

  isEmpty() {
    return this.data.length;
  }

  getGpsData(): GnssRecord[] {
    return this.data.filter(d => isGnss(d)) as GnssRecord[];
  }

  getLastTime() {
    return this.data.length ? this.data[this.data.length - 1].system_time : 0;
  }

  getEvenlyDistancedFramesFromSensorData(prevKeyFrames: FrameKmRecord[]): FrameKmRecord[] {
    let prevGNSS: GnssRecord | null = null;
    let nextGNSS: GnssRecord | null = null;
    let lastIMU: ImuRecord | null = null;
    let closestFrame: IImage | null = null;

    const res: FrameKmRecord[] = [];

    let spaceCurve = null;
    let prevCurveLength = 0;
    let curveLength = 0;
    let prevSelected = null;
    let gps: { longitude: number, latitude: number }[] = [];

    if (prevKeyFrames.length) {
      gps = prevKeyFrames.slice(-3);
      spaceCurve = catmullRomCurve(gps, ['longitude', 'latitude', undefined], true);
      curveLength = spaceCurve.getLength();
      prevSelected = prevKeyFrames.pop();
    }

    for (const sensorData of this.data) {
      if (isImu(sensorData)) {
        // iterate fast through IMU samples
        lastIMU = sensorData as ImuRecord;
        continue;
      } else if (isImage(sensorData) && nextGNSS && spaceCurve) {
        closestFrame = sensorData as IImage;
        prevGNSS = { ...nextGNSS } as GnssRecord;
        prevCurveLength = curveLength;
        nextGNSS = null;
      } else if (isGnss(sensorData)) {
        nextGNSS = sensorData as GnssRecord;
        gps.push(sensorData as GnssRecord);
        spaceCurve = catmullRomCurve(gps, ['longitude', 'latitude', undefined], true);
        curveLength = spaceCurve.getLength();
      }

      // We're waiting for a condition when 
      // appropriate frame is far enough from previous sample and surrounded with closest GNSS samples
      if (
        closestFrame &&
        prevGNSS &&
        nextGNSS &&
        lastIMU &&
        prevGNSS.system_time <= closestFrame.system_time &&
        nextGNSS.system_time >= closestFrame.system_time && 
        spaceCurve &&
        curveLength &&
        (!prevSelected || distance(prevSelected, nextGNSS) > getConfig().DX)
      ) {
        // get accurate coordinates for this frame from CatmulRom curve
        const scratch: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
        const indx = (closestFrame.system_time - prevGNSS.system_time) / (nextGNSS.system_time - prevGNSS.system_time);
        const v = (prevCurveLength + (curveLength - prevCurveLength) * indx)/ curveLength;
        spaceCurve.getPointAt(v, scratch);
        const frameCoordinates = {
          longitude: scratch.x,
          latitude: scratch.y,
        };

        // Making sure it's not too close to previous frame
        if (prevSelected && distance(prevSelected, frameCoordinates) > getConfig().DX - 1) {
        // get interpolated gnss metadata
        const interpolatedGnssMetadata = interpolate(
          prevGNSS,
          nextGNSS,
          indx,
        );

        res.push({
          ...lastIMU, // imu
          ...interpolatedGnssMetadata, // linear-interpolated gnss metadata, like hdop etc
          ...closestFrame, // frame name and system time
          ...frameCoordinates, // lat and lon from curve
        });
        prevGNSS = { ...nextGNSS } as GnssRecord;
        closestFrame = null;
        nextGNSS = null;
        prevSelected = res[res.length - 1]; 
        }
      }
    }
    return res;
  }
}
