import { map, eachSeries } from 'async';
import { FRAMEKM_ROOT_FOLDER, FRAMES_ROOT_FOLDER } from 'config';
import { writeFile, readFile, appendFile, Stats, mkdir } from 'fs';
import { compressFrame, getCameraConfig, getStats, sleep } from 'util/index';

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

  let framesPath = frames.map(
    (frame: string) => FRAMES_ROOT_FOLDER + '/' + frame,
  );
  const bytesMap: { [key: string]: number } = {};
  let framesParsed = 0;

  return new Promise(async (resolve, reject) => {
    // USING NON-BLOCKING IO,
    // 0. FIRST WE NEED TO COMPRESS ALL THE FRAMES PROVIDED
    let compressedFrames: any[] = [];
    const cameraConfig = await getCameraConfig();
    try {
      compressedFrames = await map(
        framesPath,
        compressFrame.bind(
          this,
          `${cameraConfig?.camera.encoding.width}*${cameraConfig?.camera.encoding.height}`,
        ),
      );
    } catch (e: unknown) {
      reject(e);
      console.log(e);
      return;
    }
    framesPath = compressedFrames
      .map(frame => frame?.path)
      .filter(frame => frame);

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
      eachSeries(
        fileStats as Stats[],
        function (fileStat: any, callback) {
          if (
            fileStat &&
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
