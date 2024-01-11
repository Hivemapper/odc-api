import { SystemConfig, RawLogsConfiguration } from 'types/motionModel';

export const MIN_SPEED = 0.15; // meter per seconds
export const MAX_SPEED = 40; // meter per seconds
export const MAX_DISTANCE_BETWEEN_POINTS = 10;

const defaultImu = {
  threshold: 0.05,
  alpha: 0.5,
  params: [1, 1, 1, 0, 1],
};

const config: SystemConfig = {
  DX: 8,
  GnssFilter: {
    '3dLock': true,
    minSatellites: 4,
    hdop: 4,
    gdop: 6,
    eph: 10,
  },
  Privacy: {},
  MaxPendingTime: 1000 * 60 * 60 * 24 * 10,
  isCornerDetectionEnabled: true,
  isImuMovementDetectionEnabled: false,
  isLightCheckDisabled: false,
  isDashcamMLEnabled: false,
  isGyroCalibrationEnabled: false,
  isAccelerometerCalibrationEnabled: false,
  isTripTrimmingEnabled: true,
  TrimDistance: 100,
  FrameKmLengthMeters: 1000,
  ImuFilter: defaultImu,
  rawLogsConfiguration: {
    isEnabled: false,
    interval: 300,
    snapshotSize: 30,
    includeGps: true,
    includeImu: true,
    maxCollectedBytes: 5000000,
  },
  privacyRadius: 200,
};

export const getDefaultConfig = (): SystemConfig => {
  return config;
};

export const isValidConfig = (_config: SystemConfig) => {
  const isValid =
    _config &&
    Number(_config.DX) &&
    Number(_config.MaxPendingTime) &&
    typeof _config.isCornerDetectionEnabled === 'boolean' &&
    typeof _config.isImuMovementDetectionEnabled === 'boolean' &&
    typeof _config.isLightCheckDisabled === 'boolean' &&
    typeof _config.GnssFilter === 'object' &&
    isValidRawLogsConfiguration(_config.rawLogsConfiguration);
  if (isValid && !_config.ImuFilter) {
    _config.ImuFilter = defaultImu;
  }
  _config.isImuMovementDetectionEnabled = false;
  _config.isLightCheckDisabled = false;
  _config.isDashcamMLEnabled = true; // FORCE ENABLE FOR TESTING. TODO: REMOVE
  return isValid;
};

const isValidRawLogsConfiguration = (conf: RawLogsConfiguration): boolean => {
  return (
    !conf ||
    (typeof conf.interval === 'number' && typeof conf.isEnabled === 'boolean')
  );
};
