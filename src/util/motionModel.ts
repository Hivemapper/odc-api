import {
  existsSync,
  mkdir,
  readdir,
  readFile,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { GnssDopKpi } from 'types/instrumentation';
import * as THREE from 'three';
import {
  CurveData,
  FrameKMOutput,
  FramesMetadata,
  GNSS,
  GnssMetadata,
  ImuMetadata,
  MotionModelConfig,
  MotionModelCursor,
} from 'types/motionModel';
import { timeIsMostLikelyLight } from './daylight';
import {
  catmullRomCurve,
  ecefToLLA,
  interpolate,
  latLonDistance,
  latLonToECEF,
  latLonToECEFDistance,
  normaliseLatLon,
} from './geomath';
import { getGnssDopKpi, Instrumentation } from './instrumentation';
import { ICameraFile } from 'types';
import { exec, ExecException, execSync, spawn } from 'child_process';
import {
  CAMERA_TYPE,
  FRAMES_ROOT_FOLDER,
  GPS_ROOT_FOLDER,
  METADATA_ROOT_FOLDER,
  MOTION_MODEL_CURSOR,
} from 'config';
import { DEFAULT_TIME } from './lock';
import {
  getDateFromFilename,
  getDateFromUnicodeTimastamp,
  promiseWithTimeout,
} from 'util/index';
import { jsonrepair } from 'jsonrepair';

const BEST_MIN_BETWEEN_FRAMES = 4;
const BEST_MAX_BETWEEN_FRAMES = 4.75;

const MIN_SPEED = 0.275; // meter seconds
const MAX_SPEED = 40; // ms!! If you want to convert to kmh, then * 3.6
const MAX_DISTANCE_BETWEEN_POINTS = 50;
const MAX_TIMEDIFF_BETWEEN_FRAMES = 180 * 1000;
const MIN_FRAMES_TO_EXTRACT = 1;
const POTENTIAL_CORNER_ANGLE = 70;
export const MAX_FAILED_ITERATIONS = 10;
export const MAX_PER_FRAME_BYTES = 2 * 1000 * 1000;
export const MIN_PER_FRAME_BYTES = 25 * 1000;

let config: MotionModelConfig = {
  DX: 6,
  GnssFilter: {
    hdop: 7,
    '3dLock': true,
    minSatellites: 4,
  },
  MaxPendingTime: 1000 * 60 * 60 * 24 * 10,
  IsCornerDetectionEnabled: true,
};

// TODO:
export const loadConfig = (_config: MotionModelConfig) => {
  config = _config;
};

const isValidGnssMetadata = (gnss: GNSS): boolean => {
  let isValid = true;

  if (!gnss.latitude) {
    return false;
  }

  for (const [key, value] of Object.entries(config.GnssFilter)) {
    switch (key) {
      case '3dLock':
        isValid = isValid && gnss.fix === '3D';
        break;
      case 'minSatellites':
        isValid = isValid && gnss.satellites && gnss.satellites.used >= value;
        break;
      case 'xdop':
      case 'ydop':
      case 'pdop':
      case 'hdop':
      case 'vdop':
      case 'tdop':
      case 'gdop':
        isValid = isValid && !!gnss.dop && gnss.dop[key] <= value;
        break;
      default:
        break;
    }
  }
  return isValid;
};

let parsedCursor: MotionModelCursor = {
  gnssFilePath: '',
  imuFilePath: '',
};

export const syncCursors = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      if (parsedCursor.gnssFilePath) {
        console.log('Syncing cursors');
        exec(
          "echo '" +
            JSON.stringify(parsedCursor) +
            "' > " +
            MOTION_MODEL_CURSOR,
          (error: ExecException | null, stdout: string, stderr: string) => {
            resolve();
          },
        );
      } else {
        resolve();
      }
    } catch (e: unknown) {
      reject(e);
    }
  });
};

const getLastGnssName = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const exists = existsSync(MOTION_MODEL_CURSOR);
    if (exists) {
      readFile(
        MOTION_MODEL_CURSOR,
        { encoding: 'utf-8' },
        async (err: NodeJS.ErrnoException | null, data: string) => {
          if (!err && data) {
            try {
              parsedCursor = JSON.parse(jsonrepair(data));
              resolve(parsedCursor.gnssFilePath || '');
            } catch (e: unknown) {
              console.log('Error parsing Cursor file', e);
              resolve('');
            }
          } else {
            console.log('Error reading Motion Model Cursor file', err);
            try {
              await rmSync(MOTION_MODEL_CURSOR);
            } catch (e: unknown) {
              console.log('Error cleaning up Sync file');
            }
            resolve('');
          }
        },
      );
    } else {
      resolve('');
    }
  });
};

const getNextGnssName = (last: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    exec(
      `ls -1rt \`find ${GPS_ROOT_FOLDER}/ -type f -name '*.json' -newer ${last}\` | head -1`,
      { encoding: 'utf-8' },
      (error: ExecException | null, stdout: string) => {
        try {
          if (stdout && !error) {
            const nextCandidate = String(stdout).split('\n')[0];
            if (nextCandidate.indexOf('.json') !== -1) {
              parsedCursor.gnssFilePath = nextCandidate;
              resolve(parsedCursor.gnssFilePath);
            } else {
              resolve('');
            }
          } else {
            resolve('');
          }
        } catch (e: unknown) {
          resolve('');
        }
      },
    );
  });
};

let emptyIterationCounter = 0;
let prevGnssFile = '';
let prevGpsRecord: GNSS | undefined = undefined;

export const getNextGnss = (): Promise<GnssMetadata[][]> => {
  return new Promise(async (resolve, reject) => {
    let pathToGpsFile = '';
    // 1. get next after file or: if time set, then take closer
    const last = await getLastGnssName();
    let existLastFile = false;
    if (last) {
      existLastFile = await existsSync(last);
    }
    if (!last || !existLastFile) {
      console.log('No cursor mark... creating one');
      const exists = existsSync(MOTION_MODEL_CURSOR);
      if (
        Date.now() > DEFAULT_TIME &&
        (!exists || (exists && !existLastFile))
      ) {
        let lastGpsFilePath = execSync(
          `ls ${GPS_ROOT_FOLDER} | grep '.json' | tail -1`,
          {
            encoding: 'utf-8',
          },
        );
        lastGpsFilePath = String(lastGpsFilePath).split('\n')[0];
        console.log('Last candidate: ' + lastGpsFilePath);
        const lastFileTimestamp =
          getDateFromFilename(lastGpsFilePath).getTime();
        if (lastFileTimestamp > Date.now() - 300000) {
          console.log('So last will be: ' + lastGpsFilePath);
          pathToGpsFile = GPS_ROOT_FOLDER + '/' + lastGpsFilePath;
          parsedCursor.gnssFilePath = pathToGpsFile;
        } else {
          resolve([]);
          return;
        }
      } else {
        resolve([]);
        return;
      }
    } else {
      console.log('Last file is ' + last);
      pathToGpsFile = await getNextGnssName(last);
      console.log('Next file is: ' + pathToGpsFile);
    }

    if (!pathToGpsFile || pathToGpsFile === prevGnssFile) {
      emptyIterationCounter++;
      if (emptyIterationCounter > 5) {
        // After 5 empty iterations, we start to be suspicious on the weird filesystem state
        // Let's check the last GPS file stats (name timestamp and modified date timestamp)
        // Compare it with each other, system time and the time of last GPS record
        // It all should be in sync
        const now = Date.now();
        let lastFileTimestamp = now;
        let lastFileStats = null;
        if (last) {
          lastFileTimestamp = getDateFromFilename(
            String(last).split('/').pop() || '',
          ).getTime();
          lastFileStats = statSync(last);
        }

        const week = 1000 * 60 * 60 * 24 * 7;
        const isFilenameOutdated =
          lastFileTimestamp < now - week || lastFileTimestamp > now + week;
        const prevGpsRecordTimestamp = new Date(
          prevGpsRecord?.timestamp || '',
        ).getTime();
        const isGpsDataOutOfSyncWithFileDate =
          prevGpsRecord &&
          lastFileStats &&
          prevGpsRecordTimestamp < lastFileStats.mtime.getTime() - week &&
          prevGpsRecordTimestamp > lastFileStats.mtime.getTime() + week;

        if (
          isFilenameOutdated ||
          isGpsDataOutOfSyncWithFileDate ||
          emptyIterationCounter > MAX_FAILED_ITERATIONS
        ) {
          console.log(
            'Repairing Motion model',
            isFilenameOutdated,
            isGpsDataOutOfSyncWithFileDate,
            emptyIterationCounter > MAX_FAILED_ITERATIONS,
          );
          parsedCursor.gnssFilePath = '';
          emptyIterationCounter = 0;
          if (last) {
            rmSync(last);
          }
        }
      }
      resolve([]);
      return;
    } else {
      emptyIterationCounter = 0;
    }
    prevGnssFile = pathToGpsFile;
    readFile(
      pathToGpsFile,
      { encoding: 'utf-8' },
      (err: NodeJS.ErrnoException | null, data: string) => {
        const gpsChunks: GnssMetadata[][] = [];
        let gps: GnssMetadata[] = [];
        let sequentialBadRecords = 0;
        if (!err && data) {
          try {
            let gnssRecords = JSON.parse(jsonrepair(data));
            if (Array.isArray(gnssRecords) && gnssRecords?.length) {
              prevGpsRecord = gnssRecords[0];
              console.log(
                `${gnssRecords.length} GPS records found in this file`,
              );
              gnssRecords = gnssRecords.filter(
                (record: GNSS) =>
                  record?.satellites &&
                  new Date(record?.systemtime).getTime() > DEFAULT_TIME,
              );

              const goodRecords: GNSS[] = gnssRecords.filter((gnss: GNSS) =>
                isValidGnssMetadata(gnss),
              );
              // New KPI for measuring GPS performance
              try {
                const dopKpi: GnssDopKpi = getGnssDopKpi(
                  gnssRecords,
                  goodRecords,
                );
                Instrumentation.add({
                  event: 'DashcamDop',
                  size: gnssRecords.length,
                  message: JSON.stringify(dopKpi),
                });
              } catch (e: unknown) {
                console.log(e);
              }

              let prevPoint: any;
              console.log(
                `${goodRecords.length} Good GPS records found in this file`,
              );
              gnssRecords.map((gnss: GNSS, index: number) => {
                const t = gnss?.timestamp
                  ? new Date(gnss.timestamp).getTime()
                  : 0;
                // in meters
                const distance =
                  prevPoint && gnss.latitude
                    ? latLonToECEFDistance(prevPoint, gnss)
                    : config.DX;
                // in seconds
                const prevTime = prevPoint
                  ? new Date(prevPoint.timestamp).getTime()
                  : 0;
                const timeDiff = prevTime ? (t - prevTime) / 1000 : 0;
                // speed in m/s
                const speed = timeDiff ? distance / timeDiff : MIN_SPEED;

                if (
                  t &&
                  isValidGnssMetadata(gnss) &&
                  speed < MAX_SPEED &&
                  distance < MAX_DISTANCE_BETWEEN_POINTS
                ) {
                  if (speed >= MIN_SPEED || index === gnssRecords.length - 1) {
                    gps.push({
                      t,
                      systemTime: new Date(gnss.systemtime).getTime(),
                      lat: gnss.latitude,
                      lon: gnss.longitude,
                      alt: gnss.height,
                      speed: (speed * 3600) / 1000,
                      satellites: gnss.satellites.used,
                      dilution: 0, // TBD
                      xdop: gnss.dop?.xdop || 99,
                      ydop: gnss.dop?.ydop || 99,
                      pdop: gnss.dop?.pdop || 99,
                      hdop: gnss.dop?.hdop || 99,
                      vdop: gnss.dop?.vdop || 99,
                      tdop: gnss.dop?.tdop || 99,
                      gdop: gnss.dop?.gdop || 99,
                    });
                    prevPoint = { ...gnss };
                    sequentialBadRecords = 0;
                  }
                } else if (t) {
                  sequentialBadRecords++;
                  if (gps.length && sequentialBadRecords > 3) {
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
        }
        // re-order gps records by time, just in case
        if (gps.length) {
          gps.sort((a, b) => a.t - b.t);
          gpsChunks.push(gps);
        }
        resolve(gpsChunks);
      },
    );
  });
};

export const isGnssEligibleForMotionModel = (gnss: GnssMetadata[]) => {
  console.log(
    'Eligible?',
    isEnoughLight(gnss),
    !isCarParkedBasedOnGnss(gnss),
    !isGpsTooOld(gnss),
  );
  return (
    gnss.length &&
    isEnoughLight(gnss) &&
    !isCarParkedBasedOnGnss(gnss) &&
    !isGpsTooOld(gnss)
  );
};

export function isCarParkedBasedOnGnss(gpsData: GnssMetadata[]) {
  return !gpsData.some((gps: GnssMetadata) => gps.speed > 3);
}

export const isCarParkedBasedOnImu = (imu: ImuMetadata) => {
  const accel = imu.accelerometer;
  if (accel && accel.length) {
    const accX = accel.map(acc => acc.x);
    const minX = Math.min(...accX);
    const maxX = Math.max(...accX);

    const accY = accel.map(acc => acc.y);
    const minY = Math.min(...accY);
    const maxY = Math.max(...accY);

    const accZ = accel.map(acc => acc.z);
    const minZ = Math.min(...accZ);
    const maxZ = Math.max(...accZ);

    return maxX - minX > 0.1 || maxY - minY > 0.1 || maxZ - minZ > 0.1;
  } else {
    return false;
  }
};

export const isImuValid = (imuData: ImuMetadata): boolean => {
  return (
    !!imuData.accelerometer &&
    !!imuData.gyroscope &&
    !!imuData.accelerometer.length &&
    !!imuData.gyroscope.length &&
    imuData.accelerometer[0].x !== 0 &&
    imuData.accelerometer[0].y !== 0 &&
    imuData.accelerometer[0].z !== 0
  );
};

export function isEnoughLight(gpsData: GnssMetadata[]) {
  return true;
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

export function isGpsTooOld(gpsData: GnssMetadata[]) {
  const now = Date.now();
  return gpsData.some(
    (gps: GnssMetadata) => gps.t < now - config.MaxPendingTime,
  );
}

export const getNextImu = (gnss: GnssMetadata[]): Promise<ImuMetadata> => {
  // TODO: Implement
  return Promise.resolve({
    accelerometer: [],
    magnetometer: [],
    gyroscope: [],
  });
};

const getFrameDataFromGps = (gps: GnssMetadata): FramesMetadata => {
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

export const createMotionModel = (
  gpsData: GnssMetadata[],
  imuData: ImuMetadata,
  prevSamples: FramesMetadata[] = [],
): FramesMetadata[][] => {
  if (gpsData.length < 2) {
    console.log('Not enough gps data');
    return [];
  }

  let curFrameKm: FramesMetadata[] = [];
  let curTraversal = 0;
  const frameKms: FramesMetadata[][] = [];

  curFrameKm.push(getFrameDataFromGps(gpsData[0]));

  for (let i = 1; i < gpsData.length; i++) {
    const frame = getFrameDataFromGps(gpsData[i]);

    const deltaT = gpsData[i].t - gpsData[i - 1].t;
    if (deltaT > MAX_TIMEDIFF_BETWEEN_FRAMES) {
      console.log('dashcam: frameKM cut by TIMEDIFF');
      frameKms.push(curFrameKm);
      curFrameKm = [frame];
      curTraversal = 0;
      continue;
    }
    // ignores altitude
    const aproxDist = latLonDistance(
      gpsData[i - 1].lat,
      gpsData[i].lat,
      gpsData[i - 1].lon,
      gpsData[i].lon,
    );
    curTraversal += aproxDist;
    // 2334m ~= 60s * 140km/h
    if (curTraversal > 2334) {
      console.log('dashcam: frameKM cut by MAXDIST');
      frameKms.push(curFrameKm);
      curFrameKm = [frame];
      curTraversal = 0;
      continue;
    }

    // fail hard if deltaT is 0
    const aproxSpeed = aproxDist / deltaT;
    if (!deltaT) {
      // Most probably, just two equal coordinates pushed to gpsData by mistake
      console.log('dashcam: frameKM got weird DELTA');
      // if this point is equal to previous point, simply jump to next one
      continue;
    }
    // 38.88m/s ~= 140km/h
    if (aproxSpeed > 38.88) {
      console.log('dashcam: frameKM cut by SPEED');
      frameKms.push(curFrameKm);
      curFrameKm = [frame];
      curTraversal = 0;
      continue;
    }
    curFrameKm.push(frame);
  }

  frameKms.push(curFrameKm);
  console.log(`dashcam: frameKM parsed: ${frameKms.length}`);

  let totalSamples = 0;
  const samplesToTakePerFrameKm: any[] = frameKms
    .map((frameKm, i) => {
      let lastFrames = [];
      if (i === 0) {
        lastFrames = prevSamples;
      } else {
        lastFrames = frameKms[i - 1];
      }

      let samplesToTake: FramesMetadata[] = [];
      try {
        samplesToTake = getPointsToSample(frameKm, imuData, lastFrames);
      } catch (e: any) {
        console.log('dashcam: sampling failed: ' + e);
      }
      totalSamples += samplesToTake?.length || 0;
      return samplesToTake;
    })
    .filter(frameKm => (frameKm || []).length > MIN_FRAMES_TO_EXTRACT);
  console.log(
    `dashcam: sample chunks parsed: ${samplesToTakePerFrameKm.length}`,
  );
  return totalSamples > MIN_FRAMES_TO_EXTRACT ? samplesToTakePerFrameKm : [];
};

export const getPointsToSample = (
  gpsData: FramesMetadata[],
  imuData: ImuMetadata,
  existingKeyFrames: FramesMetadata[] = [],
) => {
  // Catmull-Rom is a cubic interpolation,
  // which requires 4 points
  // to achieve a continuous first derivative.
  // We cannot invent history, but we can look
  // back in time if possible.
  // Some fallbacks supported for 3 points
  if (gpsData.length + Math.min(2, existingKeyFrames.length) < 3) {
    return [];
  }

  let points: FramesMetadata[] = gpsData;
  let offset = 0;

  if (existingKeyFrames.length > 0) {
    const n = existingKeyFrames.length;
    const m = Math.max(n - 3, 0);

    const previous = existingKeyFrames.slice(m, n - 1);
    points = previous.concat(points);

    const lastPoint = new THREE.Vector3(0, 0, 0);
    const nextPoint = new THREE.Vector3(0, 0, 0);
    latLonToECEF(points[0].lon, points[0].lat, points[0].alt, lastPoint);
    for (let i = 1; i <= previous.length; i++) {
      latLonToECEF(points[i].lon, points[i].lat, points[i].alt, nextPoint);
      offset += lastPoint.distanceTo(nextPoint);
      lastPoint.copy(nextPoint);
    }
  }

  //console.log('dashcam: points for spline: ' + points.length);
  const spaceCurve = catmullRomCurve(points, ['lon', 'lat', 'alt'], true);
  const totalDistance = spaceCurve.getLength();
  const pointsToSample: FramesMetadata[] = [];
  const curvePoints: CurveData[] = [];

  const dx = config.DX;
  const { IsCornerDetectionEnabled } = config;

  if (totalDistance) {
    console.log('total distance: ' + totalDistance + ', DX: ' + dx);
    let prevTangent = null;
    for (let u = offset; u <= totalDistance; u += dx) {
      if (IsCornerDetectionEnabled) {
        const v = u / totalDistance;
        // Compare tangent of current point with previous point to detect the potential corner
        const currTangent = spaceCurve.getTangentAt(v);
        let angle = 0;
        if (prevTangent) {
          angle = Math.abs((prevTangent.angleTo(currTangent) * 180) / Math.PI);
        }
        prevTangent = currTangent;
        if (angle > POTENTIAL_CORNER_ANGLE) {
          u = findCorner(spaceCurve, u, dx, totalDistance, angle);
        }
      }
      curvePoints.push(getPoint(spaceCurve, u / totalDistance));
    }
  }

  if (points.length < 3 || curvePoints.length < 3) {
    return [];
  }

  const searchArray = [];
  let curveCursor = 0;
  let prevCurve;
  searchArray.push(points[0]);
  searchArray.push(points[1]);
  let pointsArrayCursor = 1;

  while (
    pointsArrayCursor < points.length &&
    curveCursor < curvePoints.length
  ) {
    const curve = catmullRomCurve(searchArray, ['lon', 'lat', 'alt'], true);
    const distance = curve.getLength();
    const prevDistance = prevCurve?.getLength() || 0;
    const { lon, lat, alt, v } = curvePoints[curveCursor];

    const cursorDistance = totalDistance * v;

    if (cursorDistance < distance && cursorDistance >= prevDistance) {
      const indx = (cursorDistance - prevDistance) / (distance - prevDistance);
      const point = interpolate(
        points[pointsArrayCursor - 1],
        points[pointsArrayCursor],
        indx,
        [
          'speed',
          'satellites',
          't',
          'systemTime',
          'dilution',
          'xdop',
          'ydop',
          'pdop',
          'hdop',
          'vdop',
          'tdop',
          'gdop',
        ],
        {
          ...points[pointsArrayCursor],
          lon,
          lat,
          alt,
        },
      );
      pointsToSample.push(point);
      curveCursor++;
    } else if (cursorDistance > distance) {
      pointsArrayCursor++;
      searchArray.push(points[pointsArrayCursor]);
      prevCurve = curve;
    } else if (cursorDistance < prevDistance) {
      curveCursor++;
    }
  }

  if (pointsToSample.length < 3) {
    return [];
  }

  // Attaching IMU Data to selected points, based on their timestamps
  if (imuData && imuData.accelerometer?.length) {
    let imuCursor = 0;
    let pointCursor = 0;

    const imu = imuData.accelerometer;
    const gyro = imuData.gyroscope;

    while (imuCursor < imu.length && pointCursor < pointsToSample.length) {
      const imuTime = imu[imuCursor].ts;
      const gpsTime =
        pointsToSample[pointCursor].systemTime || pointsToSample[pointCursor].t;
      if (Math.abs(imuTime - gpsTime) < 150) {
        pointsToSample[pointCursor].acc_x = imu[imuCursor].x;
        pointsToSample[pointCursor].acc_y = imu[imuCursor].y;
        pointsToSample[pointCursor].acc_z = imu[imuCursor].z;
        if (gyro && gyro[imuCursor]) {
          pointsToSample[pointCursor].gyro_x = gyro[imuCursor].x;
          pointsToSample[pointCursor].gyro_y = gyro[imuCursor].y;
          pointsToSample[pointCursor].gyro_z = gyro[imuCursor].z;
        }
        imuCursor++;
        pointCursor++;
      } else if (imuTime < gpsTime) {
        imuCursor++;
      } else {
        pointCursor++;
      }
    }
  } else {
    console.log('Missing IMU data');
  }
  console.log(`dashcam: points sampled: ${pointsToSample?.length}`);
  return pointsToSample;
};

const getPoint = (curve: THREE.CatmullRomCurve3, v: number): CurveData => {
  const scratch: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  curve.getPointAt(v, scratch);
  ecefToLLA(scratch.x, scratch.y, scratch.z, scratch);
  const lon = scratch.x;
  const lat = scratch.y;
  const alt = scratch.z;

  return {
    lon,
    lat,
    alt,
    v,
  };
};

const findCorner = (
  curve: THREE.CatmullRomCurve3,
  u: number,
  dx: number,
  totalDistance: number,
  fullAngle: number,
) => {
  const currTangent = curve.getTangentAt(u / totalDistance);

  // Make small iterative steps from current point back to previous point, to find the best candidate for the angle point
  // If we have an X angle between tangents,
  // The best candidate point on our spline will have X/2 angle between its tangent and previous point's tangent.
  for (let i = 0; i < 10; i++) {
    const newU = u - (i * dx) / 10;
    const v = newU / totalDistance;
    const cornerTangent = curve.getTangentAt(v);
    const angle = (cornerTangent.angleTo(currTangent) * 180) / Math.PI;
    if (angle > fullAngle / 2 - 5) {
      console.log(
        'corner detected:' + fullAngle + ' angle, point moved to: ' + angle,
      );
      return newU;
    }
  }
  return u;
};

const formatUnixTimestamp = (unixTimestamp: number) => {
  const dateObj = new Date(unixTimestamp);
  const year = dateObj.getFullYear();
  const month = ('0' + (dateObj.getMonth() + 1)).slice(-2);
  const day = ('0' + dateObj.getDate()).slice(-2);
  const hours = ('0' + dateObj.getHours()).slice(-2);
  const minutes = ('0' + dateObj.getMinutes()).slice(-2);
  const seconds = ('0' + dateObj.getSeconds()).slice(-2);
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const getImagesForDateRangeLegacy = async (
  from: number,
  to: number,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const startTimestampCmd = `date -d '${formatUnixTimestamp(
      from,
    )}' '+%Y%m%d%H%M.%S'`;
    const endTimestampCmd = `date -d '${formatUnixTimestamp(
      to,
    )}' '+%Y%m%d%H%M.%S'`;

    const now = Date.now();
    const touchStartCmd = `touch -d "$(${startTimestampCmd})" /tmp/start_timestamp`;
    const touchEndCmd = `touch -d "$(${endTimestampCmd})" /tmp/end_timestamp`;

    const findCmd = `find ${FRAMES_ROOT_FOLDER} -type f -newer /tmp/start_timestamp ! -newer /tmp/end_timestamp`;

    const options: any = {
      shell: true,
      stdio: ['ignore', 'pipe', 'inherit'],
    };

    const touchStart = spawn(touchStartCmd, options);

    touchStart.on('error', err => {
      console.error(`Failed to execute touch start command: ${err}`);
      reject();
    });

    touchStart.on('close', code => {
      if (code !== 0) {
        console.error(`Touch start command exited with code ${code}`);
      } else {
        const touchEnd = spawn(touchEndCmd, options);

        touchEnd.on('error', err => {
          console.error(`Failed to execute touch end command: ${err}`);
          reject();
        });

        touchEnd.on('close', code => {
          if (code !== 0) {
            console.error(`Touch end command exited with code ${code}`);
            reject();
          } else {
            let result = '';
            const find = spawn(findCmd, options);

            find.on('error', err => {
              console.error(`Failed to execute find command: ${err}`);
              reject();
            });

            find.stdout.setEncoding('utf8');
            find.stdout.on('data', data => {
              result += data.toString() + '/n';
            });

            find.on('close', () => {
              console.log('Operation took: ' + (Date.now() - now));
              resolve(result);
            });
          }
        });
      }
    });
  });
};

export const getImagesForDateRange = async (from: number, to: number) => {
  return new Promise(resolve => {
    try {
      readdir(
        FRAMES_ROOT_FOLDER,
        (err: NodeJS.ErrnoException | null, files: string[]) => {
          try {
            const jpgFiles: ICameraFile[] = files
              .filter(
                (filename: string) =>
                  filename.indexOf('.jpg') !== -1 &&
                  filename.indexOf('.tmp') === -1,
              )
              .map(filename => {
                return {
                  path: filename,
                  date: getDateFromUnicodeTimastamp(filename).getTime(),
                };
              });

            const filteredFiles = jpgFiles.filter((file: ICameraFile) => {
              return !(file.date < from || file.date > to);
            });

            resolve(filteredFiles);
          } catch (error) {
            console.log(error);
            resolve([]);
          }
        },
      );
    } catch (error) {
      console.log(error);
      resolve([]);
    }
  });
};

export const selectImages = (
  frameKM: FramesMetadata[],
): Promise<FrameKMOutput[]> => {
  return new Promise(async (resolve, reject) => {
    const results: FrameKMOutput[] = [];
    const dateStart = frameKM[0].systemTime || frameKM[0].t;
    const dateEnd =
      frameKM[frameKM.length - 1].systemTime || frameKM[frameKM.length - 1].t;

    if (frameKM[0].systemTime) {
      console.log(
        'Log diff between systemTime and gps Time on dashcam:',
        Math.abs(frameKM[0].systemTime - frameKM[0].t),
      );
    }

    let images = [];
    try {
      console.log('Date range is: ', dateStart, dateEnd);
      images = await promiseWithTimeout(
        getImagesForDateRange(dateStart, dateEnd),
        10000,
      );
    } catch (e: unknown) {
      console.log(e);
    }

    console.log(
      'Fetched ' +
        images.length +
        ' images for current FrameKM GPS timestamp filtering',
    );

    if (dateEnd - dateStart > 10000) {
      // Log AvgFps, only if date range is at least 10 SEC, to make it more accurate
      const secs = (dateEnd - dateStart) / 1000;

      Instrumentation.add({
        event: 'DashcamFps',
        start: Math.round(dateStart),
        end: Math.round(dateEnd),
        size: Math.round(images.length / secs),
      });
    } else {
      console.log(
        'Difference between start and end is too small for measuring Fps',
        dateEnd - dateStart,
      );
    }

    if (!images.length) {
      console.log('No images selected');
      resolve([{ chunkName: '', metadata: [], images: [] }]);
      return;
    }

    console.log('==========');

    let imagesToDownload: ICameraFile[] = [];
    let gpsForImages: FramesMetadata[] = [];

    let imageCursor = 0;
    let gpsCursor = 1;

    const subChunks = [];

    while (imageCursor < images.length && gpsCursor < frameKM.length) {
      const frameTimestamp = images[imageCursor].date;
      const nextFrameTimestamp =
        imageCursor + 1 < images.length ? images[imageCursor + 1].date : null;

      // USE SYSTEM TIME HERE: super important.
      // That's how we align images timestamps and GPS coords
      const prevPoint = gpsForImages.length
        ? gpsForImages[gpsForImages.length - 1]
        : frameKM[gpsCursor - 1];
      const nextPoint = frameKM[gpsCursor];

      const prevTime = prevPoint.systemTime;
      const nextTime = nextPoint.systemTime;

      let distance = latLonToECEFDistance(prevPoint, nextPoint);
      const distanceRange = getDistanceRangeBasedOnSpeed(prevPoint.speed / 3.6);

      if (
        distance < distanceRange.MAX_DISTANCE &&
        gpsCursor !== frameKM.length - 1 &&
        gpsForImages.length
      ) {
        // Making the brackets wider
        gpsCursor++;
      } else if (frameTimestamp >= prevTime && frameTimestamp <= nextTime) {
        // normalising GPS coordinates for this time difference
        let pointForFrame = normaliseLatLon(
          prevPoint,
          nextPoint,
          frameTimestamp,
        );

        distance = latLonToECEFDistance(prevPoint, pointForFrame);

        if (distance < distanceRange.MIN_DISTANCE) {
          if (!imagesToDownload.length) {
            imagesToDownload = [images[imageCursor]];
            gpsForImages = [pointForFrame];
          }
          imageCursor++;
        } else if (distance > distanceRange.MAX_DISTANCE) {
          // NEED TO CUT FRAMEKM HERE
          console.log(
            `cutting frameKM of size ${
              imagesToDownload.length
            } cause of distance between frames: ${distance}, delay in msecs: ${
              frameTimestamp - prevTime
            }, speed: ${prevPoint.speed}`,
          );
          if (imagesToDownload.length) {
            subChunks.push({
              images: imagesToDownload,
              points: gpsForImages,
            });
          }
          imagesToDownload = [images[imageCursor]];
          gpsForImages = [pointForFrame];
          imageCursor++;
        } else {
          // Let's check if the next frame could be the better candidate to go into motion model
          if (
            nextFrameTimestamp &&
            nextFrameTimestamp >= prevTime &&
            nextFrameTimestamp <= nextTime
          ) {
            const candidateFrame = normaliseLatLon(
              prevPoint,
              nextPoint,
              nextFrameTimestamp,
            );

            distance = latLonToECEFDistance(prevPoint, candidateFrame);
            if (
              distance >= BEST_MIN_BETWEEN_FRAMES &&
              distance <= BEST_MAX_BETWEEN_FRAMES
            ) {
              imageCursor++;
              pointForFrame = { ...candidateFrame };
            }
          }

          if (gpsForImages.length > 60) {
            // cut the chunk
            subChunks.push({
              images: imagesToDownload,
              points: gpsForImages,
            });
            imagesToDownload = [images[imageCursor]];
            gpsForImages = [pointForFrame];
          } else {
            gpsForImages.push(pointForFrame);
            imagesToDownload.push(images[imageCursor]);
          }
          imageCursor++;
        }
      } else if (frameTimestamp < prevTime) {
        imageCursor++;
      } else {
        gpsCursor++;
      }
    }

    if (imagesToDownload.length) {
      subChunks.push({
        images: imagesToDownload,
        points: gpsForImages,
      });
    }

    // LOOP FOR DOWNLOADING CHUNKS
    let chunkName = '';

    if (!subChunks.length) {
      console.log('No chunks were packed for provided frames and gpsData');
      resolve([{ chunkName: '', metadata: [], images: [] }]);
      return;
    }

    for (let i = 0; i < subChunks.length; i++) {
      const chunk = subChunks[i];
      if (chunk.images.length > 1) {
        const formattedTime = new Date(chunk.points[0].t)
          .toISOString()
          .replace(/[-:]/g, '')
          .replace('T', '_')
          .split('.')[0];
        chunkName = 'km_' + formattedTime + '_' + i;

        chunk.images.map(
          (image: ICameraFile, i: number) =>
            (chunk.points[i].name = image.path),
        );
        // TODO: Return true metadata
        results.push({
          chunkName,
          metadata: chunk.points,
          images: chunk.images,
        });
      }
    }

    resolve(results);
  });
};

export const packMetadata = async (
  name: string,
  framesMetadata: FramesMetadata[],
  images: ICameraFile[],
  bytesMap: { [key: string]: number },
) => {
  // 0. MAKE DIR FOR CHUNKS, IF NOT DONE YET
  try {
    await new Promise(resolve => {
      mkdir(METADATA_ROOT_FOLDER, resolve);
    });
  } catch (e: unknown) {
    console.log(e);
  }
  let numBytes = 0;
  const validatedFrames: FramesMetadata[] = [];
  for (let i = 0; i < images.length; i++) {
    const image: ICameraFile = images[i];
    const bytes = bytesMap[image.path];
    if (bytes && bytes > MIN_PER_FRAME_BYTES && bytes < MAX_PER_FRAME_BYTES) {
      framesMetadata[i].bytes = bytes;
      framesMetadata[i].name = image.path;
      // @ts-ignore
      delete framesMetadata[i].systemTime;
      framesMetadata[i].t = Math.round(framesMetadata[i].t);
      framesMetadata[i].satellites = Math.round(framesMetadata[i].satellites);

      validatedFrames.push(framesMetadata[i]);
      numBytes += bytes;
    }
  }
  if (numBytes) {
    const metadataJSON = {
      bundle: {
        name,
        numFrames: validatedFrames.length,
        size: numBytes,
        deviceType: CAMERA_TYPE,
        quality: 80,
        loraDeviceId: undefined,
        keyframeDistance: config.DX,
        resolution: '2k',
        version: '1.6',
      },
      frames: validatedFrames,
    };
    try {
      writeFileSync(
        METADATA_ROOT_FOLDER + '/' + name + '.json',
        JSON.stringify(metadataJSON),
        { encoding: 'utf-8' },
      );
      console.log('Metadata written for ' + name);
    } catch (e: unknown) {
      console.log('Error writing Metadata file');
    }
  } else {
    console.log('No bytes for: ' + name);
  }
};

const getDistanceRangeBasedOnSpeed = (speed: number) => {
  const dx = config.DX;
  // speed in meters per seconds
  if (speed < 20) {
    // means camera producing 1 frame per 2 meters max, so we can hit the best approx for DX
    return {
      MIN_DISTANCE: dx - 1,
      MAX_DISTANCE: dx + 2,
    };
  } else if (speed < 25) {
    // distance between two frames is close to 5 meters, but still less
    return {
      MIN_DISTANCE: dx - 1,
      MAX_DISTANCE: dx + 2,
    };
  } else if (speed < 30) {
    return {
      MIN_DISTANCE: dx,
      MAX_DISTANCE: dx + 3,
    };
  } else if (speed < 40) {
    return {
      MIN_DISTANCE: dx,
      MAX_DISTANCE: dx + 4,
    };
  } else {
    // return default, if speed provided is not valid
    return {
      MIN_DISTANCE: dx - 1,
      MAX_DISTANCE: dx + 2,
    };
  }
};
