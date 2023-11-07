import { map } from 'async';
import { FRAMEKM_ROOT_FOLDER, FRAMES_ROOT_FOLDER, UNPROCESSED_FRAMEKM_ROOT_FOLDER } from 'config';
import {
  Stats,
  mkdir,
  stat,
  createReadStream,
  createWriteStream,
  writeFileSync,
  promises,
} from 'fs';
import { promisify } from 'util';
import { join } from 'path';
import { pipeline } from 'stream';
import sizeOf from 'image-size';

import { getStats, sleep } from 'util/index';
import { Instrumentation } from './instrumentation';
import { MAX_PER_FRAME_BYTES, MIN_PER_FRAME_BYTES } from './motionModel';
import { getConfig } from './motionModel/config';
import { ICameraFile } from 'types';
import { FrameKMTelemetry, FramesMetadata } from 'types/motionModel';
import { getDiskUsage } from 'services/logDiskUsage';

const asyncPipeline = promisify(pipeline);
const asyncStat = promisify(stat);
const retryLimit = 3;
const retryDelay = 500; // milliseconds

type BytesMap = { [key: string]: number };

export const concatFrames = async (
  frames: string[],
  framekmName: string,
  retryCount = 0,
  frameRootFolder = FRAMES_ROOT_FOLDER,
  disableMLCheck = false,
  destFolder?: string,
): Promise<BytesMap> => {
  // 0. MAKE DIR FOR CHUNKS, IF NOT DONE YET
  const isDashcamMLEnabled = getConfig().isDashcamMLEnabled && destFolder && !disableMLCheck;
  const frameKmFolder = isDashcamMLEnabled ? UNPROCESSED_FRAMEKM_ROOT_FOLDER : FRAMEKM_ROOT_FOLDER;
  try {
    await new Promise(resolve => {
      mkdir(frameKmFolder, resolve);
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

    const outputFilePath = frameKmFolder + '/' + framekmName;

    try {
      if (isDashcamMLEnabled && destFolder) {
        try {
          await new Promise(resolve => {
            mkdir(destFolder, resolve);
          });
        } catch (e: unknown) {
          console.log(e);
        }
        for (const file of validFrames) {
          const filePath = FRAMES_ROOT_FOLDER + '/' + file.name;
          await promises.copyFile(filePath, destFolder + '/' + framekmName + 'ww' + file.name);
          bytesMap[file.name] = file.size;
          totalBytes += file.size;
        }
        await sleep(200);
      } else {
        writeFileSync(outputFilePath, '');
        for (const file of validFrames) {
          const filePath = frameRootFolder + '/' + file.name;
          const writeStream = createWriteStream(outputFilePath, { flags: 'a' });
          const readStream = createReadStream(filePath);
          await asyncPipeline(readStream, writeStream);
          let fileName = file.name;
          if (file.name.indexOf('ww') > -1) {
            fileName = file.name.split('ww')[1];
          }
          bytesMap[fileName] = file.size;
          totalBytes += file.size;
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

export const getFrameKmTelemetry = async (image: ICameraFile, meta: FramesMetadata[]): Promise<FrameKMTelemetry> => {
  const telemetry: FrameKMTelemetry = {
    systemtime: Date.now(),
  };
  if (image && image.path && meta.length) {
    try {
      const record = meta[0];
      const fullPath = join(FRAMES_ROOT_FOLDER, image.path);
      const dimensions = sizeOf(fullPath);
      if (dimensions) {
        telemetry.width = dimensions.width;
        telemetry.height = dimensions.height;
      }
      if (record && record.lat) {
        telemetry.lat = record.lat;
        telemetry.lon = record.lon;
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
      console.log('Error getting image sizes for ' + image.path, e);
    }
  }
  return telemetry;
}