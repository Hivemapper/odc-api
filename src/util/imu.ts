import { ImuMetadata, IXYZPoint } from 'types/motionModel';
import { KalmanFilter } from './filter';
import { Instrumentation } from './instrumentation';
import { getConfig } from './motionModel';

export const complementaryFilter = (
  accelData: IXYZPoint,
  gyroData: IXYZPoint,
  dt: number,
  alpha: number,
) => {
  // The alpha parameter determines how much weight to give to the accelerometer and gyroscope data.
  // It should be a value between 0 and 1.
  // A common choice is to set alpha based on the ratio of the time constants of the accelerometer and gyroscope.

  // Convert accelerometer data to angle (assuming data is in m/s^2)
  const accelAngle = Math.atan2(accelData.y, accelData.x);

  // Integrate gyroscope data to get angle (assuming data is in rad/s)
  const gyroAngle = gyroData.z * dt; // using z-axis gyroscope data

  // Combine accelerometer and gyroscope data
  const combinedAngle = alpha * gyroAngle + (1 - alpha) * accelAngle;

  return combinedAngle;
};

export const isCarParkedBasedOnImu = (imu: ImuMetadata) => {
  const accel = imu.accelerometer;
  if (accel && accel.length > 1) {
    // Calculate time difference (dt) between measurements
    const dt = (accel[1].ts - accel[0].ts) / 1000; // in seconds
    if (dt <= 0) {
      return false;
    }

    const config = getConfig();

    // Initialize Kalman filter
    const kf = new KalmanFilter(1, 1, 1, 0, 1);

    // Apply complementary filter and Kalman filter
    const filteredAngles = [];
    for (let i = 1; i < accel.length; i++) {
      const accelData = accel[i];
      const gyroData = imu.gyroscope[i];
      const angle = complementaryFilter(
        accelData,
        gyroData,
        dt,
        config.ImuFilter.alpha,
      );
      const filteredAngle = kf.filter(angle);
      filteredAngles.push(filteredAngle);
    }

    // Compute standard deviation of filtered data
    const stdDev = standardDeviation(filteredAngles);

    // Set a threshold for movement. This is a parameter you will need to tune.
    const threshold = config.ImuFilter.threshold;
    const isParked = stdDev <= threshold;
    console.log('Was car parked?', isParked);
    if (isParked) {
      Instrumentation.add({
        event: 'DashcamNotMoving',
        size: accel.length,
        message: JSON.stringify({
          threshold,
          alpha: config.ImuFilter.alpha,
          deviation: stdDev,
          angles: filteredAngles.slice(0, 5),
          accel: accel.slice(0, 5),
          gyro: imu.gyroscope?.slice(0, 5),
        }),
      });
    }
    // If standard deviation of acceleration in any direction is above the threshold, consider the car to be moving
    if (config.isImuMovementDetectionEnabled) {
      return isParked;
    } else {
      return false;
    }
  } else {
    return false;
  }
};

const standardDeviation = (values: number[]) => {
  const avg = average(values);

  const squareDiffs = values.map(value => {
    const diff = value - avg;
    const sqrDiff = diff * diff;
    return sqrDiff;
  });

  const avgSquareDiff = average(squareDiffs);

  const stdDev = Math.sqrt(avgSquareDiff);
  return stdDev;
};

const average = (data: number[]) => {
  const sum = data.reduce((sum: number, value: number) => {
    return sum + value;
  }, 0);

  const avg = sum / data.length;
  return avg;
};
