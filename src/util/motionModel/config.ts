import { MOTION_MODEL_CONFIG } from 'config';
import { writeFile } from 'fs';
import { MotionModelConfig, RawLogsConfiguration } from 'types/motionModel';

export const MIN_SPEED = 0.275; // meter per seconds
export const MAX_SPEED = 40; // meter per seconds
export const MAX_DISTANCE_BETWEEN_POINTS = 50;

const defaultImu = {
  threshold: 0.05,
  alpha: 0.5,
  params: [1, 1, 1, 0, 1],
};

let config: MotionModelConfig = {
  DX: 6,
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

export const loadConfig = (
  _config: MotionModelConfig,
  updateFile?: boolean,
) => {
  if (isValidConfig(_config)) {
    config = _config;
    if (updateFile) {
      writeFile(
        MOTION_MODEL_CONFIG,
        JSON.stringify(config),
        {
          encoding: 'utf-8',
        },
        () => {},
      );
    }
  } else {
    console.log('trying to load invalid dashcam configuration: ', _config);
  }
};

export const getConfig = (): MotionModelConfig => {
  return config;
};

export const isValidConfig = (_config: MotionModelConfig) => {
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
  return isValid;
};

const isValidRawLogsConfiguration = (conf: RawLogsConfiguration): boolean => {
  return (
    !conf ||
    (typeof conf.interval === 'number' && typeof conf.isEnabled === 'boolean')
  );
};
