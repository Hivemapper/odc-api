import { map } from 'async';
import { FRAMEKM_ROOT_FOLDER, FRAMES_ROOT_FOLDER } from 'config';
import {
  Stats,
  mkdir,
  stat,
  createReadStream,
  createWriteStream,
  writeFileSync,
} from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { pipeline } from 'stream';
import sizeOf from 'image-size';

import { getStats, sleep } from 'util/index';
import { Instrumentation } from './instrumentation';
import { DetectionsByFrame, DetectionsData, FrameKMTelemetry } from 'types/motionModel';
import { getDiskUsage } from 'services/logDiskUsage';
import { FrameKM } from 'types/sqlite';

export const MAX_PER_FRAME_BYTES = 2 * 1000 * 1000;
export const MIN_PER_FRAME_BYTES = 25 * 1000;

const asyncPipeline = promisify(pipeline);
const asyncStat = promisify(stat);
const asyncExec = promisify(exec);
const retryLimit = 3;
const retryDelay = 500; // milliseconds

type BytesMap = { [key: string]: number };
type ExifPerFrame = { [key: string]: { 
  privacyDetections: DetectionsData[], 
  signDetections: DetectionsData[], 
  landmarks: DetectionsData[]}
}

export const prepareExifPerFrame = (
  privacyDetections: DetectionsByFrame = {},
  signDetections: DetectionsByFrame = {},
  landmarks: DetectionsByFrame = {},
): ExifPerFrame => {
  const exif: ExifPerFrame = {};

  for (const frame in privacyDetections) {
    let frameExif = exif[frame] || {};
    frameExif['privacyDetections'] = privacyDetections[frame];
    exif[frame] = frameExif;
  }
  for (const frame in signDetections) {
    let frameExif = exif[frame] || {};
    frameExif['signDetections'] = signDetections[frame];
    exif[frame] = frameExif;
  }
  for (const frame in landmarks) {
    let frameExif = exif[frame] || {};
    frameExif['landmarks'] = landmarks[frame];
    exif[frame] = frameExif;
  }
  return exif;
}

export const concatFrames = async (
  frames: string[],
  framekmName: string,
  retryCount = 0,
  frameRootFolder = FRAMES_ROOT_FOLDER,
  exifPerFrame: ExifPerFrame = {},
): Promise<BytesMap> => {
  // 0. MAKE DIR FOR CHUNKS, IF NOT DONE YET
  try {
    await new Promise(resolve => {
      mkdir(FRAMEKM_ROOT_FOLDER, resolve);
    });
  } catch (e: unknown) {
    console.log(e);
  }

  const framesPath = frames.map(
    (frame: string) => frameRootFolder + '/' + frame,
  );
  const bytesMap: BytesMap = {};
  let totalBytes = 0;

  if (retryCount >= retryLimit) {
    console.log('Giving up concatenation after 3 attempts.');
    Instrumentation.add({
      event: 'DashcamFailedPackingFrameKm',
      size: totalBytes,
      message: JSON.stringify({ name: framekmName, reason: 'Max retries' }),
    });
    return bytesMap;
  }

  // USING NON-BLOCKING IO,
  // 1. GET SIZE FOR EACH FRAME, AND FILTER OUT ALL INEXISTANT
  let fileStats: any[] = [];
  try {
    fileStats = await map(framesPath, getStats);
  } catch (e: unknown) {
    console.log(e);
    return bytesMap;
  }

  // 2. PACK IT ALTOGETHER INTO A SINGLE CHUNK USING NON-BLOCKING I/O FUNCTION
  try {
    const validFrames = fileStats.filter(
      (file: Stats) =>
        file &&
        file.size > MIN_PER_FRAME_BYTES &&
        file.size < MAX_PER_FRAME_BYTES,
    );
    if (validFrames.length < 2) {
      Instrumentation.add({
        event: 'DashcamFailedPackingFrameKm',
        size: totalBytes,
        message: JSON.stringify({
          name: framekmName,
          reason: 'Not enough frames',
        }),
      });
      return bytesMap;
    }

    const outputFilePath = FRAMEKM_ROOT_FOLDER + '/' + framekmName;

    try {
        writeFileSync(outputFilePath, '');
        for (const file of validFrames) {
          const filePath = frameRootFolder + '/' + file.name;
          if (exifPerFrame[file.name]) {
            try {
              await asyncExec(`exiftool -comment="${JSON.stringify(exifPerFrame[file.name]).replace(/"/g, '\\"')}" ${filePath}`);
            } catch (e: unknown) {
              console.log('Error updating exif', e);
            }
          }
          const writeStream = createWriteStream(outputFilePath, { flags: 'a' });
          const readStream = createReadStream(filePath);
          await asyncPipeline(readStream, writeStream);
          bytesMap[file.name] = file.size;
          totalBytes += file.size;
          await sleep(10);
        }
        await sleep(500);
  
        // VERY IMPORTANT STEP
        // Check file size to validate the full process
        const { size } = await asyncStat(outputFilePath);
        if (size !== totalBytes) {
          console.log(
            'Concatenated file size does not match totalBytes, retrying...',
            size,
            totalBytes,
          );
          await sleep(retryDelay);
          return concatFrames(frames, framekmName, retryCount + 1);
        }
    } catch (error) {
      console.log(`Error during concatenation:`, error);
      console.log('Waiting a bit before retrying concatenation...');
      await sleep(retryDelay);
      return concatFrames(frames, framekmName, retryCount + 1);
    }

    return bytesMap;
  } catch (error) {
    Instrumentation.add({
      event: 'DashcamFailedPackingFrameKm',
      size: totalBytes,
      message: JSON.stringify({ name: framekmName, reason: 'Error', error }),
    });
    return bytesMap;
  }
};

export const getFrameKmTelemetry = async (framesFolder: string, meta: FrameKM): Promise<FrameKMTelemetry> => {
  const telemetry: FrameKMTelemetry = {
    systemtime: Date.now(),
  };
  if (meta.length && meta[0].image_name) {
    try {
      const record = meta[0];
      const fullPath = join(framesFolder, record.image_name || '');
      const dimensions = sizeOf(fullPath);
      if (dimensions) {
        telemetry.width = dimensions.width;
        telemetry.height = dimensions.height;
      }
      if (record && record.latitude) {
        telemetry.lat = record.latitude;
        telemetry.lon = record.longitude;
      }
      if (record && record.acc_x) {
        telemetry.accel_x = record.acc_x;
        telemetry.accel_y = record.acc_y;
        telemetry.accel_z = record.acc_z;
      }
      if (record && record.gyro_x) {
        telemetry.gyro_x = record.gyro_x;
        telemetry.gyro_y = record.gyro_y;
        telemetry.gyro_z = record.gyro_z;
      }
      telemetry.disk_used = getDiskUsage();
    } catch (e: unknown) {
      console.log('Error getting image sizes', e);
    }
  }
  return telemetry;
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