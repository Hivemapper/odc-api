import { ImuRecord } from 'types/sqlite';

const ACCEL_IMU_VALID_THRESHOLD = 2.5;

export const isImuValid = (imu: ImuRecord): boolean => {
  return (
    imu.acc_x !== undefined && Math.abs(imu.acc_x) < ACCEL_IMU_VALID_THRESHOLD && 
    imu.acc_y !== undefined && Math.abs(imu.acc_y) < ACCEL_IMU_VALID_THRESHOLD && 
    imu.acc_z !== undefined && Math.abs(imu.acc_z) < ACCEL_IMU_VALID_THRESHOLD && 
    imu.gyro_x !== undefined && 
    imu.gyro_y !== undefined && 
    imu.gyro_z !== undefined
  );
};

