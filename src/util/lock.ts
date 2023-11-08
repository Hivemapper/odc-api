export const DEFAULT_TIME = 1698796800000; // 2023-11-01, dashcam default time is less than this date. So once the date is bigger, we know that system time is set
let lockTime = 0;

export const ifTimeSet = () => {
  return Date.now() > DEFAULT_TIME;
};

export const setLockTime = (ttff: number) => {
  lockTime = ttff;
};

export const getLockTime = () => {
  return {
    lockTime,
  };
};
