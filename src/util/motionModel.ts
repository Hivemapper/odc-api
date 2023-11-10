import {
  existsSync,
  mkdir,
  promises,
  readdir,
  rmdirSync,
  writeFileSync,
} from 'fs';
import * as THREE from 'three';
import {
  CurveData,
  FrameKMOutput,
  FrameKMTelemetry,
  FramesMetadata,
  GnssMetadata,
  ImuMetadata,
} from 'types/motionModel';
import {
  catmullRomCurve,
  ecefToLLA,
  interpolate,
  latLonDistance,
  normaliseLatLon,
} from './geomath';
import { Instrumentation } from './instrumentation';
import { CameraType, ICameraFile } from 'types';
import { exec } from 'child_process';
import {
  CAMERA_TYPE,
  DATA_LOGGER_SERVICE,
  FRAMES_ROOT_FOLDER,
  GPS_ROOT_FOLDER,
  METADATA_ROOT_FOLDER,
  UNPROCESSED_FRAMEKM_ROOT_FOLDER,
  UNPROCESSED_METADATA_ROOT_FOLDER,
} from 'config';
import {
  getDateFromUnicodeTimestamp,
  promiseWithTimeout,
} from 'util/index';
import { tmpFrameName } from 'routes/recordings';
import console from 'console';
import { isPrivateLocation } from './privacy';

import { MAX_DISTANCE_BETWEEN_POINTS, getConfig } from './motionModel/config';
import { getFrameDataFromGps } from './motionModel/gnss';
import { concatFrames, getFrameKmTelemetry } from './framekm';
import { clearFrameKmTable, getFrameKmMetadata, getFrameKmName, isInProgress } from 'sqlite/framekm';
import { join } from 'path';

const MAX_TIMEDIFF_BETWEEN_FRAMES = 180 * 1000;
const MIN_FRAMES_TO_EXTRACT = 1;
export const MAX_FAILED_ITERATIONS = 14;
export const MAX_PER_FRAME_BYTES = 2 * 1000 * 1000;
export const MIN_PER_FRAME_BYTES = 25 * 1000;

const MIN_DISTANCE_BETWEEN_FRAMES = 1;
const MIN_TIME_BETWEEN_FRAMES = 33; // Max 30fps
const POTENTIAL_CORNER_ANGLE = 90;

export const createMotionModel = (
  gpsData: GnssMetadata[],
  imuData: ImuMetadata,
  existingKeyFrames: FramesMetadata[]
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
    .map(frameKm => {
      let samplesToTake: FramesMetadata[] = [];
      try {
        samplesToTake = getPointsToSample(frameKm, imuData, existingKeyFrames);
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
  existingKeyFrames: FramesMetadata[]
) => {
  // Catmull-Rom is a cubic interpolation,
  // which requires 4 points
  // to achieve a continuous first derivative.
  // We cannot invent history, but we can look
  // back in time if possible.
  if (gpsData.length + Math.min(2, existingKeyFrames.length) < 2) {
    return [];
  }

  let points: FramesMetadata[] = gpsData;
  const offset = 0;
  const { isCornerDetectionEnabled, DX } = getConfig();
  // TODO: revisit with next iteration
  const dx = DX + 0.2; // This is a very important addition for having the wider brackets to select frames more accurately
  let previous = [];

  if (existingKeyFrames.length > 0) {
    const n = existingKeyFrames.length;
    previous = existingKeyFrames.slice(n - 3);
    const last = previous[previous.length - 1];
    const next = gpsData[0];
    const dist = latLonDistance(last.lat, next.lat, last.lon, next.lon);
    if (dist < 50) {
      points = previous.concat(points);
    } else {
      previous = [];
    }
  }

  const spaceCurve = catmullRomCurve(points, ['lon', 'lat', undefined], true);
  const totalDistance = spaceCurve.getLength();
  const pointsToSample: FramesMetadata[] = [];
  let curvePoints: CurveData[] = [];

  if (totalDistance) {
    console.log('total distance: ' + totalDistance + ', DX: ' + dx);
    let prevTangent = null;
    for (let u = offset; u <= totalDistance; u += dx) {
      if (isCornerDetectionEnabled) {
        const v = u / totalDistance;
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
  curvePoints = curvePoints.slice(previous.length);

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
    const curve = catmullRomCurve(searchArray, ['lon', 'lat', undefined], true);
    const distance = curve.getLength();
    const prevDistance = prevCurve?.getLength() || 0;
    const { lon, lat, v } = curvePoints[curveCursor];

    const cursorDistance = totalDistance * v;
    if (
      (cursorDistance < distance && cursorDistance >= prevDistance) ||
      (cursorDistance === 0 && distance !== prevDistance)
    ) {
      const indx = (cursorDistance - prevDistance) / (distance - prevDistance);
      const point = interpolate(
        points[pointsArrayCursor - 1],
        points[pointsArrayCursor],
        indx,
        [
          'speed',
          'satellites',
          't',
          'alt',
          'systemTime',
          'dilution',
          'xdop',
          'ydop',
          'pdop',
          'hdop',
          'vdop',
          'tdop',
          'gdop',
          'eph',
        ],
        {
          ...points[pointsArrayCursor],
          lon,
          lat,
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
                  filename.indexOf('.tmp') === -1 &&
                  filename !== tmpFrameName,
              )
              .map(filename => {
                return {
                  path: filename,
                  date: getDateFromUnicodeTimestamp(filename).getTime(),
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

let sequenceOfOldGpsData = 0;
let repairedCursors = 0;

export const checkForPossibleDataRepairment = (dateStart: number, dateEnd?: number) => {
  sequenceOfOldGpsData++;
  if (sequenceOfOldGpsData > 5) {
    if (repairedCursors > 5) {
      exec(`rm -r ${GPS_ROOT_FOLDER} && mkdir ${GPS_ROOT_FOLDER} && systemctl restart ${DATA_LOGGER_SERVICE} && systemctl restart camera-bridge`);
      Instrumentation.add({
        event: 'DashcamRepairedGps',
        start: Math.round(dateStart),
        end: Math.round(dateEnd || dateStart),
      });
      repairedCursors = 0;
      sequenceOfOldGpsData = 0;
    } else {
      console.log('Repairing the cursor to solve the unsync between frames and GPS logs');
      Instrumentation.add({
        event: 'DashcamRepairedCursors',
        start: Math.round(dateStart),
        end: Math.round(dateEnd || dateStart),
      });
      sequenceOfOldGpsData = 0;
      repairedCursors++;
    }
  }
}

export const selectImages = (
  frameKM: FramesMetadata[],
): Promise<FrameKMOutput[]> => {
  return new Promise(async (resolve, reject) => {
    const results: FrameKMOutput[] = [];
    if (!frameKM.length) {
      console.log('No points to work with');
      resolve([{ chunkName: '', metadata: [], images: [] }]);
      return;
    }
    const dateStart = frameKM[0].systemTime || frameKM[0].t;
    const dateEnd =
      (frameKM[frameKM.length - 1].systemTime ||
        frameKM[frameKM.length - 1].t) + 1000;

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

    let fps = 0;
    if (dateEnd - dateStart > 2000) {
      // Log AvgFps, only if date range is at least 2 SEC, to make it more accurate
      const secs = (dateEnd - dateStart) / 1000;
      fps = Math.round(images.length / secs);
      Instrumentation.add({
        event: 'DashcamFps',
        start: Math.round(dateStart),
        end: Math.round(dateEnd),
        size: fps,
      });
      if (fps === 0) {
        console.log('0 FPS detected, potential candidate for repairment');
        checkForPossibleDataRepairment(dateStart, dateEnd);
      } else {
        sequenceOfOldGpsData = 0;
      }
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

      const totalDistance = latLonDistance(
        prevPoint.lat,
        nextPoint.lat,
        prevPoint.lon,
        nextPoint.lon,
      );
      const distanceRange = getDistanceRangeBasedOnSpeed(prevPoint.speed / 3.6);

      if (nextTime < prevTime || (totalDistance < distanceRange.MIN_DISTANCE && gpsCursor !== frameKM.length - 1)) {
        gpsCursor++;
      } else if (
        (frameTimestamp >= prevTime && frameTimestamp <= nextTime + 50) ||
        gpsCursor === frameKM.length - 1
      ) {
        // normalising GPS coordinates for this time difference
        let pointForFrame = normaliseLatLon(
          prevPoint,
          nextPoint,
          frameTimestamp,
        );

        let distance = latLonDistance(
          prevPoint.lat,
          pointForFrame.lat,
          prevPoint.lon,
          pointForFrame.lon,
        );

        if (isPrivateLocation(pointForFrame.lat, pointForFrame.lon)) {
          if (imagesToDownload.length) {
          // NEED TO CUT FRAMEKM HERE
            console.log(
              `cutting frameKM of size ${
                imagesToDownload.length
              } cause of private location`,
            );
            subChunks.push({
              images: imagesToDownload,
              points: gpsForImages,
            });
            imagesToDownload = [];
            gpsForImages = [];
          }
          if (gpsCursor !== frameKM.length - 1) {
            gpsCursor++;
          }
          imageCursor++;
        } else if (distance < distanceRange.MIN_DISTANCE) {
          if (!imagesToDownload.length) {
            imagesToDownload = [images[imageCursor]];
            gpsForImages = [pointForFrame];
          } else {
            // Let's check if the next frame could be the better candidate to go into motion model
            if (nextFrameTimestamp) {
              const candidateFrame = normaliseLatLon(
                prevPoint,
                nextPoint,
                nextFrameTimestamp,
              );

              distance = latLonDistance(
                prevPoint.lat,
                candidateFrame.lat,
                prevPoint.lon,
                candidateFrame.lon,
              );
              if (
                distance >= distanceRange.BEST_MIN_DISTANCE &&
                distance <= distanceRange.MAX_DISTANCE
              ) {
                imageCursor++;
                pointForFrame = { ...candidateFrame };
                gpsForImages.push(pointForFrame);
                imagesToDownload.push(images[imageCursor]);
                if (gpsCursor !== frameKM.length - 1) {
                  gpsCursor++;
                }
              }
            }
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
          if (gpsCursor !== frameKM.length - 1) {
            gpsCursor++;
          }
          imageCursor++;
        } else {
          // Let's check if the next frame could be the better candidate to go into motion model
          if (nextFrameTimestamp) {
            const candidateFrame = normaliseLatLon(
              prevPoint,
              nextPoint,
              nextFrameTimestamp,
            );

            distance = latLonDistance(
              prevPoint.lat,
              candidateFrame.lat,
              prevPoint.lon,
              candidateFrame.lon,
            );
            if (
              distance >= distanceRange.BEST_MIN_DISTANCE &&
              distance <= distanceRange.MAX_DISTANCE
            ) {
              imageCursor++;
              pointForFrame = { ...candidateFrame };
            }
          }

          gpsForImages.push(pointForFrame);
          imagesToDownload.push(images[imageCursor]);
          imageCursor++;
          if (gpsCursor !== frameKM.length - 1) {
            gpsCursor++;
          }
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

    try {
      Instrumentation.add({
        event: 'DashcamMotionModelReport',
        size: frameKM.length,
        message: JSON.stringify({
          points: frameKM.length,
          framesFound: subChunks.reduce(
            (acc, obj) => acc + obj?.images?.length || 0,
            0,
          ),
          dateStart,
          dateEnd,
          firstImageTs: images?.[0]?.date,
          lastImageTs: images?.[images.length - 1]?.date,
          chunks: subChunks.length,
          fps,
          lat: frameKM?.[0]?.lat,
          lon: frameKM?.[0]?.lon,
        }),
      });
    } catch (e: unknown) {
      console.log('Error adding the log');
    }

    for (let i = 0; i < subChunks.length; i++) {
      const chunk = subChunks[i];
      const validChunk: { images: ICameraFile[]; points: FramesMetadata[] } = {
        images: [],
        points: [],
      };
      validChunk.images.push(chunk.images[0]);
      validChunk.points.push(chunk.points[0]);

      if (chunk.images.length > 1) {
        // First, sanitise the data
        for (let k = 1; k < chunk.images.length; k++) {
          const lastFrame = validChunk.points[validChunk.points.length - 1];
          const curFrame = chunk.points[k];
          if (curFrame.t - lastFrame.t > MIN_TIME_BETWEEN_FRAMES) {
            const delta = latLonDistance(
              lastFrame.lat,
              curFrame.lat,
              lastFrame.lon,
              curFrame.lon,
            );
            if (delta > MIN_DISTANCE_BETWEEN_FRAMES) {
              validChunk.images.push(chunk.images[k]);
              validChunk.points.push(chunk.points[k]);
            }
          }
        }

        if (validChunk.images.length > 1) {
          // check that last point is not equal to first point, weird loop defect
          const firstPoint = validChunk.points[0];
          const lastPoint =
            validChunk.points[validChunk.points.length - 1];
          if (firstPoint.lat && firstPoint.lon && firstPoint.lat === lastPoint.lat && firstPoint.lon === lastPoint.lon) {
            validChunk.points.pop();
            validChunk.images.pop();
          }
          // If still more than 1:
          if (validChunk.images.length > 1) {
            const formattedTime = new Date(validChunk.points[0].t)
              .toISOString()
              .replace(/[-:]/g, '')
              .replace('T', '_')
              .split('.')[0];
            chunkName =
              'km_' + formattedTime + '_' + validChunk.images.length + '_' + i;

            validChunk.images.map(
              (image: ICameraFile, i: number) =>
                (validChunk.points[i].name = image.path),
            );
            // TODO: Return true metadata
            results.push({
              chunkName,
              metadata: validChunk.points,
              images: validChunk.images,
            });
          }
        }
      }
    }

    resolve(results);
  });
};

let bundleName = '';
let destFolder = '';

export const checkFrameKmContinuity = async (lastFrames: FramesMetadata[], next: GnssMetadata) => {
  if (await isInProgress()) {
    const last = lastFrames[lastFrames.length - 1];
    const distance = latLonDistance(last.lat, next.lat, last.lon, next.lon);

    if (distance > MAX_DISTANCE_BETWEEN_POINTS) {
      console.log('dashcam: frameKM cut by DISTANCE');
      const frameKmName = await getFrameKmName();
      if (frameKmName) {
        try {
          await packFrameKm(await getFrameKmMetadata(true));
          await clearFrameKmTable(true);
          await promises.rmdir(join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, frameKmName), { recursive: true });
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      console.log('ALL GOOD, CONTINUOUS!');
    }
  }
}

export const packFrameKm = async (frameKm: FrameKMOutput) => {
  console.log(
    'Ready to pack ' + frameKm.metadata.length + ' frames',
  );
  try {
    if (!destFolder && getConfig().isDashcamMLEnabled) {
      bundleName = frameKm.chunkName;
      destFolder = UNPROCESSED_FRAMEKM_ROOT_FOLDER + '/_' + bundleName + '_bundled';
      if (existsSync(destFolder)) {
        rmdirSync(destFolder, { recursive: true });
      }
      await new Promise(resolve => {
        mkdir(destFolder, resolve);
      });
    }
    const start = Date.now();
    const bytesMap = await promiseWithTimeout(
      concatFrames(
        frameKm.metadata.map(
          (item: FramesMetadata) => item.name || '',
        ),
        frameKm.chunkName,
        0,
        FRAMES_ROOT_FOLDER,
        false,
        destFolder,
      ),
      15000,
    );
    let totalBytes = 0;
    if (bytesMap && Object.keys(bytesMap).length) {
      totalBytes = (Object.values(bytesMap) as number[]).reduce(
        (acc: number, curr: number | undefined) =>
          acc + (Number(curr) || 0),
        0,
      );
      await promiseWithTimeout(
        packMetadata(
          frameKm.chunkName,
          frameKm.metadata,
          frameKm.images,
          bytesMap,
        ),
        5000,
      );
    }
    let framekmTelemetry: FrameKMTelemetry = {
      systemtime: Date.now()
    };
    try {
      framekmTelemetry = await promiseWithTimeout(getFrameKmTelemetry(frameKm.images[0], frameKm.metadata), 5000);
    } catch (error: unknown) {
      console.log('Error getting telemetry', error);
    }
    Instrumentation.add({
      event: 'DashcamPackedFrameKm',
      size: totalBytes,
      message: JSON.stringify({
        name: frameKm.chunkName,
        numFrames: frameKm.images?.length,
        duration: Date.now() - start,
        ...framekmTelemetry,
      }),
    });
  } catch (error: unknown) {
    Instrumentation.add({
      event: 'DashcamFailedPackingFrameKm',
      message: JSON.stringify({
        name: frameKm.chunkName,
        reason: 'Motion Model Error',
        error,
      }),
    });
    console.log(error);
  }
}

export const getNumFramesFromChunkName = (name: string) => {
  if (name) {
    const parts = name.split('_');
    if (parts.length > 3) {
      return Number(parts[3]);
    } else {
      return 0;
    }
  } else {
    return 0;
  }
};

export const packMetadata = async (
  name: string,
  framesMetadata: FramesMetadata[],
  images: ICameraFile[],
  bytesMap: { [key: string]: number },
  disableMlCheck = false
): Promise<FramesMetadata[]> => {
  // 0. MAKE DIR FOR CHUNKS, IF NOT DONE YET
  const isDashcamMLEnabled = getConfig().isDashcamMLEnabled && !disableMlCheck;
  const metadataFolder = isDashcamMLEnabled ? UNPROCESSED_METADATA_ROOT_FOLDER : METADATA_ROOT_FOLDER;
  try {
    await new Promise(resolve => {
      mkdir(metadataFolder, resolve);
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
       const metaForFrame = framesMetadata.find(m => m.name === image.path);
       if (metaForFrame) {
        const { systemTime, ...frame } = metaForFrame;
        frame.bytes = bytes;
        frame.name = image.path;
        frame.t = Math.round(framesMetadata[i].t);
        frame.satellites = Math.round(framesMetadata[i].satellites);
        //@ts-ignore
        validatedFrames.push(frame);
        numBytes += bytes;
       }
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
        keyframeDistance: getConfig().DX,
        resolution: '2k',
        version: '1.8',
      },
      frames: validatedFrames,
    };
    try {
      writeFileSync(
        metadataFolder + '/' + name + '.json',
        JSON.stringify(metadataJSON),
        { encoding: 'utf-8' },
      );
      console.log('Metadata written for ' + name);
      return metadataJSON.frames;
    } catch (e: unknown) {
      console.log('Error writing Metadata file');
      return [];
    }
  } else {
    console.log('No bytes for: ' + name);
    return [];
  }
};

const getDistanceRangeBasedOnSpeed = (speed: number) => {
  const dx = getConfig().DX;

  // We use brackets around DX to help the distance between points being not so strict to respect FPS of the camera
  // Obviously, for bigger FPS we can be more strict on DX to be close to perfect
  // HDC supports 10FPS, so we need bigger brackets around DX to catch the image made close to particular timestamp
  const BRACKET_INDEX = CAMERA_TYPE === CameraType.HdcS ? 0.2 : 0.5;
  
  // speed in meters per seconds
  if (speed < 20) {
    // means camera producing 1 frame per 2 meters max, so we can hit the best approx for DX
    return {
      MIN_DISTANCE: dx - BRACKET_INDEX,
      MAX_DISTANCE: dx + BRACKET_INDEX * 3,
      BEST_MIN_DISTANCE: dx - 0.2,
      BEST_MAX_DISTANCE: dx + BRACKET_INDEX,
    };
  } else if (speed < 25) {
    // distance between two frames is close to 5 meters, but still less
    return {
      MIN_DISTANCE: dx - BRACKET_INDEX,
      MAX_DISTANCE: dx + BRACKET_INDEX * 6,
      BEST_MIN_DISTANCE: dx - 0.1,
      BEST_MAX_DISTANCE: dx + BRACKET_INDEX * 3,
    };
  } else if (speed < 30) {
    return {
      MIN_DISTANCE: dx,
      MAX_DISTANCE: dx + BRACKET_INDEX * 8,
      BEST_MIN_DISTANCE: dx,
      BEST_MAX_DISTANCE: dx + BRACKET_INDEX * 4,
    };
  } else if (speed < 40) {
    return {
      MIN_DISTANCE: dx - BRACKET_INDEX,
      MAX_DISTANCE: dx + BRACKET_INDEX * 9,
      BEST_MIN_DISTANCE: dx,
      BEST_MAX_DISTANCE: dx + BRACKET_INDEX * 5,
    };
  } else {
    // return default, if speed provided is not valid
    return {
      MIN_DISTANCE: dx - BRACKET_INDEX * 2,
      MAX_DISTANCE: dx + BRACKET_INDEX * 6,
      BEST_MIN_DISTANCE: dx - BRACKET_INDEX,
      BEST_MAX_DISTANCE: dx + BRACKET_INDEX * 3,
    };
  }
};
