import { fetchImuLogsByTime } from 'sqlite/imu';
import { GnssMetadata, ImuMetadata } from 'types/motionModel';
import { ImuRecord } from 'types/sqlite';

export const isImuValid = (imuData: ImuMetadata): boolean => {
  return (
    !!imuData.accelerometer &&
    !!imuData.gyroscope &&
    !!imuData.accelerometer.length &&
    !!imuData.gyroscope.length &&
    imuData.accelerometer[0].x !== 0 &&
    imuData.accelerometer[0].y !== 0 &&
    imuData.accelerometer[0].z !== 0
  );
};

export const getNextImu = (gnss: GnssMetadata[]): Promise<ImuMetadata> => {
  // TODO: Implement
  const imuData: ImuMetadata = {
    accelerometer: [],
    magnetometer: [],
    gyroscope: [],
  };
  return new Promise(async resolve => {
    if (!gnss || !gnss.length) {
      resolve(imuData);
      return;
    }
    const timeout = setTimeout(() => {
      resolve(imuData);
    }, 5000);
    // Backward compatibility support for old 't' field
    const since = gnss[0].systemTime || gnss[0].t;
    const until = gnss[gnss.length - 1].systemTime || gnss[gnss.length - 1].t;

    try {
      const imuRecords = await fetchImuLogsByTime(since, until);
      if (Array.isArray(imuRecords)) {
        imuRecords.map((imu: ImuRecord) => {
          if (imu && imu.time) {
            const imuTimestamp = new Date(imu.time).getTime();
            imuData.accelerometer.push({
              x: Number(imu.acc_x) || 0,
              y: Number(imu.acc_y) || 0,
              z: Number(imu.acc_z) || 0,
              ts: imuTimestamp,
            });
            imuData.gyroscope.push({
              x: Number(imu.gyro_x) || 0,
              y: Number(imu.gyro_y) || 0,
              z: Number(imu.gyro_z) || 0,
              ts: imuTimestamp,
            });
          }
        });
        resolve(imuData);
      }
    } catch (error: unknown) {
      clearTimeout(timeout);
      resolve(imuData);
    }
  });
};
