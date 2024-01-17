import { exec } from 'child_process';
import { IMU_CALIBRATOR_PATH } from 'config';
import { promisify } from 'util';
import { IService } from '../types';
import { getConfig } from 'sqlite/config';

const calibrate = async (sensor: string) => {
  const awaitableExec = promisify(exec);

  console.log(`Calibrating ${sensor}.`);
  await awaitableExec(`${IMU_CALIBRATOR_PATH} --sensor=${sensor} --clear-calibration`);
  await awaitableExec(`${IMU_CALIBRATOR_PATH} --sensor=${sensor}`);

  try {
    await awaitableExec(`${IMU_CALIBRATOR_PATH} --sensor=${sensor} --verify-calibration`);
  } catch (error) {
    console.log(`${sensor} calibration failed, resetting to factory calibration`);
    await awaitableExec(`${IMU_CALIBRATOR_PATH} --sensor=${sensor} --clear-calibration`);
  }
  console.log(`Completed ${sensor} calibration.`)
}

export const InitIMUCalibrationService: IService = {
  execute: async () => {
    const config = await getConfig(['isGyroCalibrationEnabled', 'isAccelerometerCalibrationEnabled']);

    if (config.isGyroCalibrationEnabled) {
      await calibrate('gyro');
    }

    if (config.isAccelerometerCalibrationEnabled) {
      await calibrate('accelerometer');
    }
  },
  delay: 4000,
};
