import { Request } from 'express';
import { ICameraConfig, ICameraFile, IMU } from '../types';
import { generate } from 'shortid';
import { UpdateCameraConfigService } from 'services/updateCameraConfig';
import {
  access,
  constants,
  readFile,
  stat,
  Stats,
  writeFile,
  writeFileSync,
} from 'fs';
import { CACHED_CAMERA_CONFIG, WEBSERVER_LOG_PATH } from 'config';
import { exec } from 'child_process';

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

export const getDateFromUnicodeTimastamp = (filename: string) => {
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

export const getCpuLoad = (callback: (load: number) => void) => {
  try {
    exec(
      `uptime | awk '{print $7}'`,
      {
        encoding: 'utf-8',
      },
      (error, stdout) => {
        let cpuLoad = 0;
        if (!error) {
          try {
            const parsed = Math.round(Number(stdout.replace(',', '')));
            if (parsed) {
              cpuLoad = parsed;
            }
          } catch {
            callback(0);
          }
        }
        callback(cpuLoad);
      },
    );
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
