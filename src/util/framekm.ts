import { filter, map, eachSeries } from 'async';
import { FRAMEKM_ROOT_FOLDER, FRAMES_ROOT_FOLDER } from 'config';
import { writeFile, readFile, appendFile, Stats, mkdir } from 'fs';
import { fileExists, getStats, sleep } from 'util/index';

const MAX_PER_FRAME_BYTES = 2 * 1000 * 1000;
const MIN_PER_FRAME_BYTES = 25 * 1000;

export const concatFrames = async (
  frames: string[],
  framekmName: string,
): Promise<any> => {
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
  let framesParsed = 0;

  return new Promise(async (resolve, reject) => {
    // USING NON-BLOCKING IO,
    // 1. CHECK WHICH FRAMES DO EXIST
    let existingFrames: string[] = [];
    try {
      existingFrames = await filter(framesPath, fileExists);
    } catch (e: unknown) {
      reject(e);
      console.log(e);
      return;
    }

    // 2. GET SIZES FOR EACH FRAME
    let fileStats: any[] = [];
    try {
      fileStats = await map(existingFrames, getStats);
    } catch (e: unknown) {
      reject(e);
      console.log(e);
      return;
    }

    // 3. PACK IT ALL TOGETHER INTO A SINGLE CHUNK USING NON-BLOCKING IO FUNCTION
    try {
      eachSeries(
        fileStats as Stats[],
        function (fileStat: any, callback) {
          if (
            fileStat.size > MIN_PER_FRAME_BYTES &&
            fileStat.size < MAX_PER_FRAME_BYTES
          ) {
            try {
              readFile(
                FRAMES_ROOT_FOLDER + '/' + fileStat.name,
                (err, payload: any) => {
                  if (err) {
                    callback(null);
                  } else {
                    if (!framesParsed) {
                      try {
                        writeFile(
                          FRAMEKM_ROOT_FOLDER + '/' + framekmName,
                          payload,
                          async err => {
                            if (!err) {
                              bytesMap[fileStat.name] = fileStat.size;
                            }
                            await sleep(100);
                            callback(null);
                          },
                        );
                        framesParsed++;
                      } catch (e: unknown) {
                        callback(null);
                      }
                    } else {
                      try {
                        appendFile(
                          FRAMEKM_ROOT_FOLDER + '/' + framekmName,
                          payload,
                          err => {
                            if (!err) {
                              bytesMap[fileStat.name] = fileStat.size;
                            }
                            callback(null);
                          },
                        );
                      } catch (e: unknown) {
                        callback(null);
                      }
                    }
                  }
                },
              );
            } catch (e: unknown) {
              console.log(e);
              callback(null);
            }
          } else {
            callback(null);
          }
        },
        () => {
          resolve(bytesMap);
        },
      );
    } catch (e: unknown) {
      reject(e);
      console.log(e);
    }
  });
};
