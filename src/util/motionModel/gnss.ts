import { GnssRecord } from 'types/sqlite';
import {
  MAX_DISTANCE_BETWEEN_POINTS,
  MAX_SPEED,
  MIN_SPEED,
  getConfig,
} from './config';
import { FramesMetadata, GNSS, GnssMetadata } from 'types/motionModel';
import { fetchGnssLogsByTime } from 'sqlite/gnss';
import { DEFAULT_TIME } from 'util/lock';
import { GnssDopKpi } from 'types/instrumentation';
import { Instrumentation, getGnssDopKpi } from 'util/instrumentation';
import { latLonDistance } from 'util/geomath';
import { timeIsMostLikelyLight } from 'util/daylight';
const DEFAULT_GNSS_FETCH_INTERVAL = 30000;

const isValidGnssMetadata = (gnss: GnssRecord): boolean => {
  let isValid = true;

  if (!gnss.latitude) {
    return false;
  }

  for (const [key, value] of Object.entries(getConfig().GnssFilter)) {
    if (typeof value === 'number') {
      switch (key) {
        case '3dLock':
          isValid = isValid && gnss.fix === '3D';
          break;
        case 'minSatellites':
          isValid =
            isValid && !!gnss.satellites_used && gnss.satellites_used >= value;
          break;
        case 'xdop':
        case 'ydop':
        case 'pdop':
        case 'hdop':
        case 'vdop':
        case 'tdop':
        case 'gdop':
          isValid = isValid && gnss[key] <= value;
          break;
        case 'eph':
          isValid = isValid && !!gnss.eph && gnss.eph <= value;
          break;
        default:
          break;
      }
    }
  }
  return isValid;
};

let prevGnssTimestamp = 0;

export const getNextGnss = async (): Promise<GnssMetadata[][]> => {
  if (!prevGnssTimestamp) {
    // TODO: read the cursor from SQLite
    prevGnssTimestamp = Date.now() - DEFAULT_GNSS_FETCH_INTERVAL; // By default, grabbing last 30 seconds of GNSS info
  }

  const gpsChunks: GnssMetadata[][] = [];
  let gps: GnssMetadata[] = [];

  try {
    let gnssRecords: GnssRecord[] = await fetchGnssLogsByTime(
      prevGnssTimestamp,
    );

    if (Array.isArray(gnssRecords)) {
      console.log(`${gnssRecords.length} GPS records fetched from SQLite`);
      gnssRecords = gnssRecords.filter(
        (record: GnssRecord) =>
          record?.satellites_seen &&
          new Date(record?.system_time).getTime() > DEFAULT_TIME,
      );

      const goodRecords: GnssRecord[] = gnssRecords.filter((gnss: GnssRecord) =>
        isValidGnssMetadata(gnss),
      );
      // New KPI for measuring GPS performance
      try {
        const dopKpi: GnssDopKpi = getGnssDopKpi(gnssRecords, goodRecords);
        Instrumentation.add({
          event: 'DashcamDop',
          size: gnssRecords.length,
          message: JSON.stringify(dopKpi),
        });
      } catch (e: unknown) {
        console.log(e);
      }

      let prevPoint: any;
      console.log(`${goodRecords.length} Good GPS records found in this file`);
      gnssRecords.map((gnss: GnssRecord, index: number) => {
        const t = gnss?.time ? new Date(gnss.time).getTime() : 0;

        const distance =
          prevPoint && gnss.latitude
            ? latLonDistance(
                prevPoint.latitude,
                gnss.latitude,
                prevPoint.longitude,
                gnss.longitude,
              )
            : getConfig().DX;

        if (
          t &&
          isValidGnssMetadata(gnss) &&
          gnss.speed < MAX_SPEED &&
          distance < MAX_DISTANCE_BETWEEN_POINTS
        ) {
          if (gnss.speed >= MIN_SPEED || index === gnssRecords.length - 1) {
            gps.push({
              t,
              systemTime: new Date(gnss.system_time).getTime(),
              lat: gnss.latitude,
              lon: gnss.longitude,
              alt: gnss.altitude,
              speed: (gnss.speed * 3600) / 1000,
              satellites: gnss.satellites_used,
              dilution: 0, // TBD
              xdop: gnss.xdop || 99,
              ydop: gnss.ydop || 99,
              pdop: gnss.pdop || 99,
              hdop: gnss.hdop || 99,
              vdop: gnss.vdop || 99,
              tdop: gnss.tdop || 99,
              gdop: gnss.gdop || 99,
              eph: gnss.eph || 999,
            });
            prevPoint = { ...gnss };
          }
        } else if (t) {
          if (distance > MAX_DISTANCE_BETWEEN_POINTS) {
            gps.sort((a, b) => a.t - b.t);
            gpsChunks.push(gps);
            gps = [];
            prevPoint = null;
          }
        }
      });
    }
  } catch (e: unknown) {
    console.log('Error parsing GPS JSON');
  }

  // re-order gps records by time, just in case
  if (gps.length) {
    gps.sort((a, b) => a.t - b.t);
    gpsChunks.push(gps);
  }
  return gpsChunks;
};

export const isGnssEligibleForMotionModel = (gnss: GnssMetadata[]) => {
  const notTooDark = isEnoughLight(gnss);
  const isCarParked = isCarParkedBasedOnGnss(gnss);
  const isTooOld = isGpsTooOld(gnss);

  console.log('Eligible?', notTooDark, !isCarParked, !isTooOld);

  if (!gnss.length) {
    Instrumentation.add({
      event: 'DashcamRejectedGps',
      message: 'badQuality',
    });
  } else if (!notTooDark) {
    Instrumentation.add({
      event: 'DashcamRejectedGps',
      message: 'notEnoughLight',
    });
  } else if (isCarParked) {
    Instrumentation.add({
      event: 'DashcamRejectedGps',
      message: 'carNotMoving',
    });
  } else if (isTooOld) {
    Instrumentation.add({
      event: 'DashcamRejectedGps',
      message: 'dataTooOld',
    });
  }
  return gnss.length && notTooDark && !isCarParked && !isTooOld;
};

export function isCarParkedBasedOnGnss(gpsData: GnssMetadata[]) {
  return !gpsData.some((gps: GnssMetadata) => gps.speed > 4);
}

export function isEnoughLight(gpsData: GnssMetadata[]) {
  if (getConfig().isLightCheckDisabled) {
    return true;
  }
  if (!gpsData.length) {
    return false;
  }
  const sufficientDaylight = timeIsMostLikelyLight(
    new Date(gpsData[0].t),
    gpsData[0].lon,
    gpsData[0].lat,
  );

  return sufficientDaylight;
}

export function isEnoughLightForGnss(gnss: GNSS | null) {
  if (!gnss || !gnss.timestamp || getConfig().isLightCheckDisabled) {
    return true;
  }
  return timeIsMostLikelyLight(
    new Date(gnss.timestamp),
    gnss.longitude,
    gnss.latitude,
  );
}

export function isGpsTooOld(gpsData: GnssMetadata[]) {
  return gpsData.some(
    (gps: GnssMetadata) => gps.t < Date.now() - getConfig().MaxPendingTime,
  );
}

export const getFrameDataFromGps = (gps: GnssMetadata): FramesMetadata => {
  return {
    ...gps,
    acc_x: 0,
    acc_y: 0,
    acc_z: 0,
    gyro_x: 0,
    gyro_y: 0,
    gyro_z: 0,
  };
};
