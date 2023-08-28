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
  existsSync,
  rmdirSync,
  renameSync,
} from 'fs';
import { promisify } from 'util';
import { pipeline } from 'stream';

import { getStats, sleep } from 'util/index';
import { Instrumentation } from './instrumentation';
import { MAX_PER_FRAME_BYTES, MIN_PER_FRAME_BYTES, getConfig } from './motionModel';

const asyncPipeline = promisify(pipeline);
const asyncStat = promisify(stat);
const retryLimit = 3;
const retryDelay = 500; // milliseconds

type BytesMap = { [key: string]: number };

export const concatFrames = async (
  frames: string[],
  framekmName: string,
  retryCount = 0,
): Promise<BytesMap> => {
  // 0. MAKE DIR FOR CHUNKS, IF NOT DONE YET
  const isDashcamMLEnabled = getConfig().isDashcamMLEnabled;
  const frameKmFolder = isDashcamMLEnabled ? UNPROCESSED_FRAMEKM_ROOT_FOLDER : FRAMEKM_ROOT_FOLDER;
  try {
    await new Promise(resolve => {
      mkdir(frameKmFolder, resolve);
    });
  } catch (e: unknown) {
    console.log(e);
  }

  const framesPath = frames.map(
    (frame: string) => FRAMES_ROOT_FOLDER + '/' + frame,
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
      if (isDashcamMLEnabled) {
        const unprocessedTempFolder = frameKmFolder + '/_' + framekmName;
        const unprocessedFolder = frameKmFolder + '/' + framekmName;
        try {
          if (existsSync(unprocessedTempFolder)) {
            rmdirSync(unprocessedTempFolder, { recursive: true });
          }
          if (existsSync(unprocessedFolder)) {
            rmdirSync(unprocessedFolder, { recursive: true });
          }
          await new Promise(resolve => {
            mkdir(unprocessedTempFolder, resolve);
          });
        } catch (e: unknown) {
          console.log(e);
        }
        for (const file of validFrames) {
          const filePath = FRAMES_ROOT_FOLDER + '/' + file.name;
          await promises.copyFile(filePath, unprocessedTempFolder + '/' + file.name);
          bytesMap[file.name] = file.size;
          totalBytes += file.size;
        }
        await sleep(200);
        renameSync(unprocessedTempFolder, unprocessedFolder);
      } else {
        writeFileSync(outputFilePath, '');
        for (const file of validFrames) {
          const filePath = FRAMES_ROOT_FOLDER + '/' + file.name;
          const writeStream = createWriteStream(outputFilePath, { flags: 'a' });
          const readStream = createReadStream(filePath);
          await asyncPipeline(readStream, writeStream);
          bytesMap[file.name] = file.size;
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
