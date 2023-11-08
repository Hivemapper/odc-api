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

export const getNextImu = async (gnss: GnssMetadata[]): Promise<ImuMetadata> => {
  // TODO: Implement
  const imuData: ImuMetadata = {
    accelerometer: [],
    magnetometer: [],
    gyroscope: [],
  };
  if (!gnss || !gnss.length) {
    return imuData;
  }

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
    }
  } catch (error: unknown) {
    console.log('Error parsing IMU logs:', error);
  }
  return imuData;
};
