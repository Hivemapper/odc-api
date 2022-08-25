let lockTime = 0;
let startTime = 0;

export const setStartTime = () => {
  startTime = Date.now();
};

export const fixTimeDiff = (msec: number) => {
  startTime += msec;
  if (lockTime) {
    lockTime += msec;
  }
};

export const setLockTime = () => {
  if (!lockTime) {
    lockTime = Date.now() - startTime;
  }
};

export const getLockTime = () => {
  return lockTime;
};
