import * as THREE from 'three';
import { CameraType, IImage, SensorData } from 'types';
import { FrameKmRecord, GnssRecord, ImuRecord } from 'types/sqlite';
import {
  catmullRomCurve,
  distance,
  ecefToLLA,
  interpolate,
  latLonDistance,
} from 'util/geomath';
import { isGnss, isImage, isImu } from 'util/sensor';
import { CAMERA_TYPE } from 'config';
import { insertErrorLog } from 'sqlite/error';
import { Instrumentation } from 'util/instrumentation';
import { getCachedValue, getConfig } from 'sqlite/config';

const MIN_DISTANCE_BETWEEN_POINTS = 1;
const MAX_ALLOWED_IMG_TIME_DROP = 300;
export const MIN_SPEED = 0.15; // meter per seconds
export const MAX_SPEED = 40; // meter per seconds

export class DraftFrameKm {
  data: SensorData[];
  lastGnss: GnssRecord | null;
  lastImageTimestamp = 0;
  totalDistance = 0;

  constructor(data?: SensorData) {
    this.data = [];
    this.lastGnss = null;

    if (data) {
      this.maybeAdd(data);
    }
  }

  prevHighSpeedEvent = 0;

  maybeAdd(data: SensorData): boolean {

    if (!this.data.length) {
      if (isGnss(data)) {
        this.lastGnss = { ...data } as GnssRecord;
      }
      this.data.push(data);
      return true;
    }

    if (isGnss(data)) {
      if (!this.lastGnss) {
        this.lastGnss = { ...data } as GnssRecord;
        this.data.push(data);
        return true;
      }

      const gnss = data as GnssRecord;
      const deltaTime = gnss.time - this.lastGnss.time;
      const distance = latLonDistance(
        this.lastGnss.latitude,
        gnss.latitude,
        this.lastGnss.longitude,
        gnss.longitude,
      );

      if (deltaTime <= 0) {
        console.log('Potential error: GPS records with no time difference');
        return true;
      }
      const speed = distance / ( deltaTime / 1000);

      /**
       * Should we add this point, or is it too soon?
       */
      if (
        distance < MIN_DISTANCE_BETWEEN_POINTS ||
        // speed < MIN_SPEED ||
        gnss.speed < MIN_SPEED
      ) {
        // no need to add points being too close to each other
        // console.log('NOT ENOUGH SOMETHING, ', distance, speed, gnss.speed);
        return true;
      }

      /**
       * Should we add this point, or should we cut the FrameKM already?
       */
      if (speed > MAX_SPEED) {
        // too fast or GPS is not accurate, cut
        insertErrorLog('Speed is to high ' + Math.round(speed) + ' ' + Math.round(deltaTime) + ' so cutting');
        console.log('===== SPEED IS TOO HIGH, ' + speed + ', ' + deltaTime + ', CUTTING =====');
        if (!this.prevHighSpeedEvent || (Date.now() - this.prevHighSpeedEvent > 10000)) {
          Instrumentation.add({
            event: 'DashcamCutReason',
            message: JSON.stringify({
              reason: 'HighSpeed',
              speed,
              distance,
              deltaTime,
            }),
          });
          this.prevHighSpeedEvent = Date.now();
        }
        return false;
      }

      if (distance > getCachedValue('DX') * 2) {
        // travelled too far, cut
        insertErrorLog('Travelled to far ' + Math.round(distance) + ' ' + Math.round(deltaTime)  + ' so cutting');
        console.log('===== TRAVELLED TOO FAR, ' + distance + ', ' + deltaTime  + ', CUTTING =====');
        Instrumentation.add({
          event: 'DashcamCutReason',
          message: JSON.stringify({
            reason: 'TravelledTooFar',
            distance,
            deltaTime,
          }),
        });
        return false;
      }

      this.lastGnss = { ...gnss };
      this.data.push(data);
      return true;

    } else if (isImage(data)) {
      if (!this.lastImageTimestamp) {
        this.lastImageTimestamp = data.system_time;
        this.data.push(data);
        return true;
      } else {
        const deltaTime = data.system_time - this.lastImageTimestamp;
        this.lastImageTimestamp = data.system_time;

        if (deltaTime > MAX_ALLOWED_IMG_TIME_DROP) {
          console.log(
            '===== FRAMERATE DROPPED, FOR ' + deltaTime + ', IGNORE FOR NOW =====',
          );
          Instrumentation.add({
            event: 'DashcamCutReason',
            message: JSON.stringify({
              reason: 'FpsDrop',
              deltaTime,
            }),
          });
        }
        this.data.push(data);
        return true;
      }
    } else if (isImu(data)) {
      this.data.push(data);
      return true;
    }

    return true;
  }

  isEmpty() {
    return !this.data.length;
  }

  getGpsData(): GnssRecord[] {
    return this.data.filter(d => isGnss(d)) as GnssRecord[];
  }

  getData(): SensorData[] {
    return this.data;
  }

  clearData() {
    this.data = [];
  }

  getLastTime() {
    if (this.data.length) {
      const lastGps = this.getGpsData()?.pop();
      if (lastGps) {
        return lastGps.system_time;
      } else {
        return this.data[this.data.length - 1].system_time;
      }
    } else {
      return 0;
    }
  }

  getEvenlyDistancedFramesFromSensorData(
    prevKeyFrames: FrameKmRecord[],
  ): FrameKmRecord[] {
    let prevGNSS: GnssRecord | null = null;
    let nextGNSS: GnssRecord | null = null;
    let lastIMU: ImuRecord | null = null;
    let closestFrame: IImage | null = null;

    const res: FrameKmRecord[] = [];

    let spaceCurve = null;
    let prevCurveLength = 0;
    let curveLength = 0;
    let prevSelected = null;
    let gps: { longitude: number; latitude: number }[] = [];
    let gpsCounter = 0;

    const DX = getCachedValue('DX');

    if (prevKeyFrames.length) {
      // Get 3 previous points for CatmulRom curve
      gps = prevKeyFrames.slice(-3);
      spaceCurve = catmullRomCurve(
        gps,
        ['longitude', 'latitude', undefined],
        true,
      );
      if (gps.length > 1) {
        curveLength = spaceCurve.getLength();
      }
      prevSelected = { ...prevKeyFrames.pop() } as GnssRecord;
      nextGNSS = {  ...prevSelected } as GnssRecord;
    }

    for (const sensorData of this.data) {
      try {
        if (isImu(sensorData)) {
          lastIMU = { ...sensorData } as ImuRecord;
          continue;
        } else if (isImage(sensorData) && nextGNSS && spaceCurve) {
          closestFrame = { ...sensorData } as IImage;
          prevGNSS = { ...nextGNSS } as GnssRecord;
          prevCurveLength = curveLength;
          console.log('image came, waiting for next gnss', prevCurveLength);
          nextGNSS = null;
        } else if (isGnss(sensorData)) {
          let prevDist = 0;
          if (nextGNSS) {
            prevDist = distance(nextGNSS, (sensorData as GnssRecord));
          }
          nextGNSS = { ...sensorData } as GnssRecord;
          if (prevSelected) {
            console.log('gnss, distance: ', distance(prevSelected, nextGNSS), prevDist);
          }
          gps.push({ ...sensorData } as GnssRecord);
          spaceCurve = catmullRomCurve(
            gps,
            ['longitude', 'latitude', undefined],
            true,
          );
          if (gps.length > 1) {
            curveLength = spaceCurve.getLength();
          }
          gpsCounter++;
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
          curveLength && prevCurveLength && curveLength > prevCurveLength && 
          (!prevSelected || distance(prevSelected, nextGNSS) > DX)
        ) {
          // get accurate coordinates for this frame from CatmulRom curve
          const scratch: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
          const indx =
            (closestFrame.system_time - prevGNSS.system_time) /
            (nextGNSS.system_time - prevGNSS.system_time);
          const v =
            (prevCurveLength + (curveLength - prevCurveLength) * indx) /
            curveLength;
            let frameCoordinates;

          try {
            spaceCurve.getPointAt(v, scratch);
            ecefToLLA(scratch.x, scratch.y, scratch.z, scratch);
            frameCoordinates = {
              longitude: scratch.x,
              latitude: scratch.y,
            };
          } catch (e: unknown) {
            console.log('Failed taking v. Defaulting to next gnss');
            frameCoordinates = {
              longitude: nextGNSS.longitude,
              latitude: nextGNSS.latitude,
            };
          }
  
          // Making sure it's not too close to previous frame
          const allowed_gap = CAMERA_TYPE === CameraType.Hdc ? 1 : 0.5;
          if (
            !prevSelected ||
            distance(prevSelected, frameCoordinates) > DX - allowed_gap
          ) {
            if (prevSelected) {
              console.log(
                'distance for frame: ' + distance(prevSelected, frameCoordinates),
              );
            } else {
              console.log('got default first frame');
            }
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
            closestFrame = null;
            prevSelected = res[res.length - 1];
          } else {
            if (prevSelected) {
              console.log('not enough distance: ', distance(prevSelected, frameCoordinates));
            }
          }
        }
      } catch (e: unknown) {
        console.log(e);
      }
    }
    console.log('Gps records traversed: ', gpsCounter, res.length);
    return gpsCounter < 3 ? [] : res;
  }
}
