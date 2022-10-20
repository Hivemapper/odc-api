import { exec } from 'child_process';
import { filter, map, eachSeries } from 'async';
import { FRAMEKM_ROOT_FOLDER, FRAMES_ROOT_FOLDER } from 'config';
import {
  access,
  stat,
  writeFile,
  readFile,
  appendFile,
  Stats,
  mkdir,
} from 'fs';

const MAX_PER_FRAME_BYTES = 2 * 1000 * 1000;
const MIN_PER_FRAME_BYTES = 25 * 1000;

export const concatFrames = async (
  frames: string[],
  framekmName: string,
): Promise<any> => {
  await new Promise(resolve => {
    mkdir(FRAMEKM_ROOT_FOLDER, resolve);
  });

  const framesPath = frames.map(
    (frame: string) => FRAMES_ROOT_FOLDER + '/' + frame,
  );
  const bytesMap: { [key: string]: number } = {};
  let framesParsed = 0;

  return new Promise((resolve, reject) => {
    filter(
      framesPath,
      function (filePath, callback) {
        access(filePath, function (err) {
          callback(null, !err);
        });
      },
      function (err, existingFrames) {
        // results now equals an array of the existing files
        map(
          existingFrames as string[],
          function (filePath: string, callback) {
            const name = filePath.split('/').pop() || '';
            try {
              stat(filePath, (err, data: Stats) => {
                callback(null, { ...data, name });
              });
            } catch (e: unknown) {
              callback(null, { size: 0, name });
            }
          },
          function (err, fileStats) {
            // results is now an array of stats for each file
            eachSeries(
              fileStats as Stats[],
              function (fileStat: any, callback) {
                if (
                  fileStat.size > MIN_PER_FRAME_BYTES &&
                  fileStat.size < MAX_PER_FRAME_BYTES
                ) {
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
                              err => {
                                if (!err) {
                                  bytesMap[fileStat.name] = fileStat.size;
                                }
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
                } else {
                  callback();
                }
              },
              () => {
                resolve(bytesMap);
              },
            );
          },
        );
      },
    );
  });
};
