export const DEFAULT_TIME = 1672000000000;
let lockTime = 0;
let isTimeSet = false;

export const ifTimeSet = () => {
  if (isTimeSet) {
    return true;
  }
  isTimeSet = Date.now() > DEFAULT_TIME;
  return isTimeSet;
};

export const setLockTime = (ttff: number) => {
  lockTime = ttff;
};

export const getLockTime = () => {
  return {
    lockTime,
  };
};
