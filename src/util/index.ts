import { Request } from 'express';
import { ICameraFile, IMU } from '../types';
import { generate } from 'shortid';
import { UpdateCameraConfigService } from 'services/updateCameraConfig';
import { access, constants, stat } from 'fs';

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
  return imu?.accel.y < -0.8;
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
        output: '/tmp/recording/preview/',
        minfreespace: 64000000,
      },
    },
    camera: {
      encoding: {
        fps: 24,
        width: 1080,
        height: 720,
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

let cameraConfig: any = {
  recording: {
    directory: {
      prefix: '',
      output: '/mnt/data/pic/',
      minfreespace: 64000000,
      output2: '/media/usb0/recording/',
      minfreespace2: 32000000,
    },
  },
  camera: {
    encoding: {
      fps: 10,
      width: 4056,
      height: 2160,
      codec: 'mjpeg',
    },
    adjustment: {
      hflip: false,
      vflip: false,
      rotation: 180,
    },
  },
};

export const getCameraConfig = () => {
  return cameraConfig;
};

export const setCameraConfig = (newCameraConfig: any) => {
  cameraConfig = newCameraConfig;
  UpdateCameraConfigService.execute();
};

export const getStats = (filePath: string, callback: any) => {
  stat(filePath, function (err, stat) {
    if (err) {
      return callback(err);
    }
    const name = filePath.split('/').pop() || '';
    callback(null, { ...stat, name });
  });
};

export const fileExists = (file: string, callback: any) => {
  access(file, constants.F_OK, err => {
    callback?.(null, !err);
  });
};
