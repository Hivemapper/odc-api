import { Request } from 'express';
import { ICameraConfig, ICameraFile, IMU } from '../types';
import { generate } from 'shortid';
import { UpdateCameraConfigService } from 'services/updateCameraConfig';
import { access, constants, readFile, stat, writeFileSync } from 'fs';
import { CACHED_CAMERA_CONFIG } from 'config';

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
