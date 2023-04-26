import { map, eachSeries } from 'async';
import { exec, ExecException } from 'child_process';
import { FRAMEKM_ROOT_FOLDER, FRAMES_ROOT_FOLDER } from 'config';
import { writeFile, readFile, appendFile, Stats, mkdir } from 'fs';
import { getStats, sleep } from 'util/index';
import { Instrumentation } from './instrumentation';

const MAX_PER_FRAME_BYTES = 2 * 1000 * 1000;
const MIN_PER_FRAME_BYTES = 25 * 1000;

export const concatFrames = async (
  frames: string[],
  framekmName: string,
): Promise<any> => {
  // 0. MAKE DIR FOR CHUNKS, IF NOT DONE YET
  try {
    await new Promise(resolve => {
      mkdir(FRAMEKM_ROOT_FOLDER, resolve);
    });
  } catch (e: unknown) {
    console.log(e);
  }

  const framesPath = frames.map(
    (frame: string) => FRAMES_ROOT_FOLDER + '/' + frame,
  );
  const bytesMap: { [key: string]: number } = {};
  let totalBytes = 0;

  return new Promise(async (resolve, reject) => {
    // USING NON-BLOCKING IO,
    // 1. GET SIZE FOR EACH FRAME, AND FILTER OUT ALL INEXISTANT
    let fileStats: any[] = [];
    try {
      fileStats = await map(framesPath, getStats);
    } catch (e: unknown) {
      reject(e);
      console.log(e);
      return;
    }

    // 2. PACK IT ALTOGETHER INTO A SINGLE CHUNK USING NON-BLOCKING I/O FUNCTION
    try {
      const validFrames = fileStats.filter(
        (file: Stats) =>
          file.size > MIN_PER_FRAME_BYTES && file.size < MAX_PER_FRAME_BYTES,
      );
      const fileNames = validFrames
        .map(
          (file: Stats & { name: string }) =>
            FRAMES_ROOT_FOLDER + '/' + file.name,
        )
        .join(' ');
      const concatCommand = `cat ${fileNames} > ${
        FRAMEKM_ROOT_FOLDER + '/' + framekmName
      }`;
      exec(concatCommand, async (error: ExecException | null) => {
        if (!error) {
          validFrames.map((file: Stats & { name: string }) => {
            bytesMap[file.name] = file.size;
            totalBytes += file.size;
          });
          await sleep(500);
          resolve(bytesMap);
          Instrumentation.add({
            event: 'DashcamPackedFrameKm',
            size: totalBytes,
          });
        } else {
          reject(error);
          console.log(error);
        }
      });
    } catch (e: unknown) {
      reject(e);
      console.log(e);
    }
  });
};
