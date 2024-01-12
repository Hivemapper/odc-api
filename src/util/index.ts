import { Request } from 'express';
import { CameraResolution, ICameraConfig, ICameraFile, IMU } from 'types';
import { generate } from 'shortid';
import { UpdateCameraConfigService } from 'services/updateCameraConfig';
import { UpdateCameraResolutionService } from 'services/updateCameraResolution';
import {
  access,
  constants,
  promises,
  createReadStream,
  readFile,
  readFileSync,
  stat,
  Stats,
  statSync,
  writeFile,
  writeFileSync,
  rmSync,
  existsSync,
} from 'fs';
import {
  CACHED_CAMERA_CONFIG,
  CACHED_RES_CONFIG,
  NEW_IMAGER_CONFIG_PATH,
  USB_WRITE_PATH,
  WEBSERVER_LOG_PATH,
} from 'config';
import { exec, spawn } from 'child_process';
import { jsonrepair } from 'jsonrepair';
import { Instrumentation } from './instrumentation';
import { cpus } from 'os';

let sessionId: string;

export const getDateFromFilename = (filename: string) => {
  try {
    const parts = filename.split('T');
    const time = parts[1].replace(/-/g, ':').split('.');
    time.pop();
    parts[1] = time.join('.');
    return new Date(parts.join('T'));
  } catch (e) {
    return new Date();
  }
};

export const getDateFromFramekmName = (filename: string) => {
  try {
    const parts = filename.split('_');
    const date = parts[1];
    const time = parts[2];
    return new Date(
      date.substring(0, 4) +
        '-' +
        date.substring(4, 6) +
        '-' +
        date.substring(6, 8) +
        'T' +
        time.substring(0, 2) +
        ':' +
        time.substring(2, 4) +
        ':' +
        time.substring(4, 6) +
        '.000Z',
    );
  } catch (e) {
    return new Date();
  }
};

export const getDateFromUnicodeTimestamp = (filename: string) => {
  try {
    const parts = filename.split('_');
    return new Date(Number(parts[0] + parts[1].substring(0, 3)));
  } catch (e) {
    return new Date();
  }
};

export const setSessionId = () => {
  sessionId = generate();
};

export const getSessionId = () => {
  return sessionId;
};

let start: [number, number] = [0, 0];
export const startSystemTimer = () => {
  start = process.hrtime();
};

export const getTimeFromBoot = () => {
  if (!start || (!start[0] && !start[1])) {
    return 0;
  }
  const end = process.hrtime(start);
  const elapsedTime = (end[0] * 1e9 + end[1]) / 1e6;
  return Math.round(elapsedTime);
};

export const deleteLogsIfTooBig = () => {
  try {
    stat(
      WEBSERVER_LOG_PATH,
      (err: NodeJS.ErrnoException | null, stats: Stats) => {
        if (stats.size > 1024 * 1024 * 2) {
          // if log is getting bigger than 2Megs,
          // wipe it
          writeFile(
            WEBSERVER_LOG_PATH,
            '',
            {
              encoding: 'utf-8',
            },
            () => {},
          );
        }
      },
    );
  } catch (error) {
    console.log('Webserver Log file is missing');
  }
};

export const filterBySinceUntil = (files: ICameraFile[], req: Request) => {
  if (req.query.since || req.query.until) {
    const since = Number(req.query.since);
    const until = Number(req.query.until);
    return files.filter((file: ICameraFile) => {
      return !((since && file.date < since) || (until && file.date > until));
    });
  } else {
    return files;
  }
};

export const stopScriptIfRunning = (scriptPath: string) => {
  return new Promise((resolve, reject) => {
      exec(`ps aux | grep "${scriptPath}" | grep -v "grep" | awk '{print $2}'`, (error, stdout, stderr) => {
          if (error) {
              reject(error);
              return;
          }

          const pids = stdout.split('\n').filter(pid => pid.trim() !== '');

          if (pids.length === 0) {
              resolve(false);  // Process is not running
              return;
          }

          // Kill each found process
          pids.forEach(pid => {
              try {
                  if (Number(pid)) {
                    process.kill(Number(pid));
                  }
              } catch (err) {
                  console.error(`Failed to kill process ${pid}`, err);
              }
          });

          resolve(true);  // Processes were running and have been terminated
      });
  });
};

export const checkIfUpsideDown = (imu: IMU) => {
  return imu && imu.accel.y < -0.8;
};

export const sleep = async (ms: number) => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
};

export const getPreviewConfig = () => {
  return {
    recording: {
      directory: {
        prefix: '',
        writeTmp: false,
        output: '/tmp/recording/preview/',
        minfreespace: 64000000,
      },
    },
    camera: {
      encoding: {
        fps: 10,
        width: 568,
        height: 320,
        codec: 'mjpeg',
      },
      adjustment: {
        hflip: false,
        vflip: false,
        rotation: 180,
      },
    },
  };
};

const defaultCameraConfig: ICameraConfig = {
  recording: {
    directory: {
      prefix: '',
      output: '/mnt/data/pic/',
      minfreespace: 64000000,
      output2: '/media/usb0/recording/',
      minfreespace2: 32000000,
      maxusedspace: 16106127360,
    },
  },
  camera: {
    encoding: { fps: 10, width: 2048, height: 1080, codec: 'mjpeg' },
    adjustment: { hflip: false, vflip: false, denoise: 'off', rotation: 180 },
  },
};

const fileExistsCache: { [key: string]: boolean } = {}; 

export async function ensureFileExists(filePath: string) {
    if (fileExistsCache[filePath]) return;

    try {
        await promises.access(filePath, constants.F_OK);
        fileExistsCache[filePath] = true;  // If access is successful, update the cache.
    } catch (error: any) {
        // If the error indicates the file doesn't exist, create it.
        if (error && error.code === 'ENOENT') {
            await promises.writeFile(filePath, '');
            fileExistsCache[filePath] = true;
        } else {
            console.error(error);
        }
    }
}

export const parseCookie = (cookie: string, name: string): string | null => {
  if (!cookie) {
    return null;
  }

  const cookies = cookie.split('; ');
  for (let i = 0; i < cookies.length; i++) {
    const [cookieName, cookieValue] = cookies[i].split('=');
    if (cookieName === name) {
      return cookieValue;
    }
  }

  return null;
}

export const addAppConnectedLog = () => {
  let usbConnected = false;
  try {
    usbConnected = existsSync(USB_WRITE_PATH);
  } catch (e: unknown) {
    console.log(e);
  }
  if (usbConnected) {
    Instrumentation.add({
      event: 'DashcamAppConnected',
      message: JSON.stringify({
        usbConnected: true
      })
    });
  } else {
    Instrumentation.add({
      event: 'DashcamAppConnected',
    });
  }
}

export const getCpuUsage = () => { 
  const cpusInfo: any = cpus()

  let user = 0;
  let nice = 0;
  let sys = 0;
  let idle = 0;
  let irq = 0;
  let total = 0;

  for(const cpu of cpusInfo){
      user += cpu?.times?.user || 0;
      nice += cpu?.times?.nice || 0;
      sys += cpu?.times?.sys || 0;
      irq += cpu?.times?.irq || 0;
      idle += cpu?.times?.idle || 0;
  }

  total = user + nice + sys + idle + irq;

  return {
      'idle': idle, 
      'total': total
  };
}

export const getCpuLoad = (callback: (load: number) => void) => {
  try {
    // Temporarilu disable CPU load check till we have optimal tool for this
    callback(0);
    // exec(
    //   `top -b -d1 -n1 | grep CPU:`,
    //   {
    //     encoding: 'utf-8',
    //   },
    //   (error, stdout) => {
    //     if (!error) {
    //       try {
    //         const parts = stdout.split(' ');
    //         const idleIndex = parts.indexOf('idle');
    //         if (idleIndex !== -1) {
    //           const cpuIdle = Number(parts[idleIndex - 1].replace('%', ''));
    //           if (cpuIdle && cpuIdle < 100) {
    //             callback(100 - cpuIdle);
    //           } else {
    //             callback(0);
    //           }
    //           return;
    //         }
    //       } catch {
    //         callback(0);
    //         return;
    //       }
    //     }
    //     callback(0);
    //   },
    // );
  } catch {
    callback(0);
  }
};

export const getQuality = (): number => {
  return defaultCameraConfig.camera.encoding.quality || 80;
};

export const getCameraConfig = async (): Promise<ICameraConfig | undefined> => {
  return defaultCameraConfig;

  const exists = await fileExists(CACHED_CAMERA_CONFIG);
  if (exists) {
    try {
      readFile(
        CACHED_CAMERA_CONFIG,
        {
          encoding: 'utf-8',
        },
        (err, data) => {
          if (err) {
            return defaultCameraConfig;
          }
          if (data) {
            try {
              const cameraConfig = JSON.parse(data.toString());
              return cameraConfig;
            } catch (e: unknown) {
              console.log('Error parsing camera config', e);
              return defaultCameraConfig;
            }
          }
        },
      );
    } catch (e: unknown) {
      console.log('Error reading camera config', e);
      return defaultCameraConfig;
    }
  } else {
    return defaultCameraConfig;
  }
};

export const getNewCameraConfig = async (): Promise<
  ICameraConfig | undefined
> => {
  let exists = await fileExists(CACHED_RES_CONFIG);
  if (exists) {
    try {
      const data = readFileSync(CACHED_RES_CONFIG, {
        encoding: 'utf-8',
      });
      if (data) {
        exists = await fileExists(NEW_IMAGER_CONFIG_PATH);
        if (exists) {
          try {
            const configJSON = readFileSync(NEW_IMAGER_CONFIG_PATH, {
              encoding: 'utf-8',
            });
            if (configJSON) {
              try {
                const cameraConfig = JSON.parse(
                  jsonrepair(configJSON.toString()),
                );
                if (cameraConfig?.directory) {
                  if (data === '2K') {
                    cameraConfig.directory.output = '';
                    cameraConfig.directory.downsampleStreamDir =
                      '/mnt/data/pic';
                  } else if (data === '4K') {
                    cameraConfig.directory.output = '/mnt/data/pic';
                    cameraConfig.directory.downsampleStreamDir = '';
                  }
                }
                return cameraConfig;
              } catch (e: unknown) {
                console.log('Error parsing camera config', e);
              }
            }
          } catch (e: unknown) {
            console.log('Error reading camera config', e);
          }
        }
      }
    } catch (e: unknown) {
      console.log('Error reading camera config', e);
    }
  }
};

export const setCameraConfig = async (newCameraConfig: ICameraConfig) => {
  writeFileSync(
    CACHED_CAMERA_CONFIG,
    JSON.stringify(newCameraConfig, null, 4),
    {
      encoding: 'utf-8',
    },
  );
  UpdateCameraConfigService.execute();
};

export const setCameraResolution = async (newCameraRes: CameraResolution) => {
  writeFileSync(CACHED_RES_CONFIG, newCameraRes, {
    encoding: 'utf-8',
  });
  UpdateCameraResolutionService.execute();
};

export const getStats = (filePath: string, callback: any) => {
  stat(filePath, function (err, stat) {
    if (err) {
      return callback(null);
    }
    const name = filePath.split('/').pop() || '';
    callback(null, { ...stat, name });
  });
};

export const fileExists = (filepath: string) => {
  return new Promise((resolve, reject) => {
    access(filepath, constants.F_OK, error => {
      resolve(!error);
    });
  });
};

export const getOldestFileDateInDirectory = (path: string): Promise<number> => {
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      resolve(0);
    }, 10000);

    try {
      const findOldestFile = spawn(`ls -rt ${path} | head -n 1`, {
        shell: true,
      });

      let oldestFile = '';
      findOldestFile.stdout.on('data', data => {
        oldestFile += data.toString().trim();
      });

      findOldestFile.on('close', () => {
        if (!oldestFile) {
          resolve(0);
          clearTimeout(timeout);
          return;
        }

        const getDate = spawn(`date -r ${path}/${oldestFile} +%s`, {
          shell: true,
        });

        getDate.stdout.on('data', data => {
          const oldestTimestamp = parseInt(data.toString().trim(), 10);
          clearTimeout(timeout);
          if (oldestTimestamp) {
            resolve(oldestTimestamp * 1000);
          } else {
            resolve(0);
          }
        });

        getDate.stderr.on('data', () => {
          resolve(0);
          clearTimeout(timeout);
          return;
        });
      });

      findOldestFile.stderr.on('data', () => {
        resolve(0);
        clearTimeout(timeout);
        return;
      });
    } catch (error) {
      resolve(0);
      clearTimeout(timeout);
      console.log(error);
      return;
    }
  });
};

export async function promiseWithTimeout(racePromise: any, timeout: number) {
  let timer: any = null;
  const wait = (ms: number) =>
    new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        reject();
      }, ms);
      return timer;
    });
  return await Promise.race([
    racePromise.finally((value: any) => {
      clearTimeout(timer);
      return value;
    }),
    wait(timeout),
  ]);
}

export async function runCommand(cmd: string, args: (string | number)[] = []) {
  const cli = `${cmd} ${args.join(' ')}`;
  return new Promise<string>((resolve, reject) => {
    exec(cli, (err, stdout, stderr) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout.concat(stderr));
      }
    });
  });
}

export async function spawnProcess(
  cmd: string,
  args: string[],
  flushOutput = false,
  env?: Record<string, string | undefined>,
  cwd?: string,
  timeout = 1000 * 60 * 60 * 1.5,
  errPatterns: string[] = [],
) {
  return new Promise<string>((resolve, reject) => {
    let out = '';
    const proc = spawn(cmd, args, {
      cwd,
      stdio: [],
      env: env || process.env,
    });

    const killer = setTimeout(() => {
      proc.kill('SIGINT');
      reject('proc timeout');
    }, timeout);

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (data: any) => {
      const strOut = String(data);
      const error = errPatterns.find(pattern => strOut.includes(pattern));
      if (error) {
        throw error;
      }
      if (flushOutput) {
        console.log(strOut);
      }
      out += strOut;
    });
    proc.stderr.on('data', (data: any) => {
      const strOut = String(data);
      const error = errPatterns.find(pattern => strOut.includes(pattern));
      if (error) {
        throw error;
      }
      if (flushOutput) {
        console.error(strOut);
      }
      out += strOut;
    });
    proc.on('error', (err: unknown) => {
      clearTimeout(killer);
      reject(err);
    });
    proc.on('close', () => {
      clearTimeout(killer);
      resolve(out);
    });
  });
}

export function tryToRemoveFile(path: string) {
  try {
    rmSync(path, { force: true });
  } catch (err) {
    console.error(err);
  }
}

export function convertTimestampToDbFormat(timestamp: number) {
  const date = new Date(timestamp);
  // Convert to ISO string and replace 'T' with a space and 'Z' with an empty string.
  let dateString = date.toISOString().replace('T', ' ').replace('Z', '');
  // Now, we need to adjust the milliseconds to match your database format (5 decimal places):
  const parts = dateString.split('.');
  // Ensure that there are exactly 5 digits for milliseconds
  parts[1] = parts[1].padEnd(5, '0').substring(0, 5);
  dateString = parts.join('.');
  return dateString;
}

export async function readLast2MB(filePath: string) {
  try {
    const { size } = statSync(filePath);
    const start = size - 2 * 1024 * 1024;
    if (start < 0) {
      // File is less than 2MB. Return the whole content.
      return readFileSync(filePath, {
        encoding: 'utf-8',
      });
    } else {
      const stream = createReadStream(filePath, {
        start,
      });
      let content = '';
      for await (const chunk of stream) {
        content += chunk.toString('utf8');
      }
      return content;
    }
  } catch (e: unknown) {
    console.log(e);
    return '';
  }
}
