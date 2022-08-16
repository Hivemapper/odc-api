import { Request } from 'express';
import { ICameraFile, IMU } from '../types';

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
