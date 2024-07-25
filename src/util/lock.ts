import { exec, ExecException } from 'child_process';
import fs from 'fs';
import { CAMERA_TYPE } from 'config';
import { CameraType } from 'types';

export const DEFAULT_TIME = 1715027100000; // 2024-05-06, dashcam default time is less than this date. So once the date is bigger, we know that system time is set
let lockTime = 0;

let timeSet = false;
export const isTimeSet = () => {
  return timeSet;
};

export const setTime = () => {
  timeSet = true;
}

let gnssTime = 0;
export const setGnssTime = (_gnssTime: number) => {
  gnssTime = _gnssTime;
  // Workaround for usb circular write issue on HDC
  // See https://linear.app/hivemapper/issue/IMCO-166/investigate-hdc-recording-issue
  if (CAMERA_TYPE === CameraType.Hdc) {
    fs.writeFile('/tmp/gnss_time.txt', gnssTime.toString(), () => {
      // Do nothing, best effort and we don't want to block.
    });
  }
}

export const getLatestGnssTime = () => {
  return gnssTime;
}

export const setLockTime = (ttff: number) => {
  lockTime = ttff;
};

export const getLockTime = () => {
  return {
    lockTime,
  };
};

