import { CAMERA_TYPE, ML_MODEL_PATH } from 'config';
import { getAsync, runAsync } from './index';
import { SystemConfig } from 'types/motionModel';
import { exec } from 'child_process';
import { CameraType, IServiceRestart } from 'types';
import { Instrumentation } from 'util/instrumentation';

const defaultConfig: SystemConfig = {
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
  isLightCheckDisabled: false,
  isDashcamMLEnabled: true,
  isGyroCalibrationEnabled: false,
  isAccelerometerCalibrationEnabled: false,
  isTripTrimmingEnabled: true,
  TrimDistance: 100,
  ChanceOfGnssAuthCheck: 0,
  lastTrimmed: 0,
  lastTimeIterated: 0,
  FrameKmLengthMeters: 1000,
  privacyRadius: 200,
  PrivacyModelPath: ML_MODEL_PATH,
  PrivacyModelHash: 'a56942a9ad253b2f61097785219df54326f21ba06ba41a175d9c5a84339d14a1',
  PrivacyConfThreshold: 0.2,
  PrivacyNmsThreshold: 0.9,
  PrivacyNumThreads: 4,
  SpeedToIncreaseDx: 24, // in meters per second
  HdcSwappiness: 20,
  HdcsSwappiness: 60,
  isProcessingEnabled: true,
  isBrokenImageFixForHdcsEnabled: true,
  isEndToEndTestingEnabled: false,
};

const cachedConfig: { [key: string]: any } = {};

export const getConfig = async (keys: string | string[], ignoreCache = false) => {
  const selectSQL = Array.isArray(keys)
    ? `SELECT key, value FROM config WHERE key IN (${keys
        .map(() => '?')
        .join(', ')})`
    : `SELECT value FROM config WHERE key = ?`;

  try {
    const rows = (
      Array.isArray(keys)
        ? await getAsync(selectSQL, keys)
        : await getAsync(selectSQL, [keys])
    ) as { key: string; value: any }[];

    // Transform the result based on the input type
    if (Array.isArray(keys)) {
      // Return an object with key-value pairs
      return rows.reduce((acc: any, row: any) => {
        let value = row?.value  ? JSON.parse(row.value) : undefined;
        if (value === undefined && !ignoreCache) {
          value = getCachedValue(row.key);
        } else {
          // cache it
          cachedConfig[row.key] = value;
        }
        acc[row.key] = value;
        return acc;
      }, {});
    } else {
      // Return the value for the single key
      let value = rows[0]?.value ? JSON.parse(rows[0].value) : undefined;
      if (value === undefined && !ignoreCache) {
        value = getCachedValue(keys);
      } else {
        // cache it
        cachedConfig[keys] = value;
      }
      return value;
    }
  } catch (error) {
    console.error('Error during retrieving from config table:', error);
    if (ignoreCache) {
      return undefined;
    }
    return Array.isArray(keys) ? keys.reduce((acc: any, key: any) => {
      acc[key] = getCachedValue(key);
      return acc;
    }, {}) : getCachedValue(keys);
  }
};

export const getFullConfig = async () => {
  const selectSQL = `SELECT * FROM config`;
  try {
    const rows = (await getAsync(selectSQL)) as {
      key: string;
      value: string;
    }[];
    const config: { [key: string]: any } = {};
    rows.forEach(row => {
      if (row && row.value !== undefined) {
        config[row.key] = JSON.parse(row.value); 
      }
    });
    return config;
  } catch (error) {
    console.error('Error during retrieving from config table:', error);
    return {};
  }
};

export const setConfig = async (key: string, value: any) => {
  const insertSQL = `INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`;
  const valueJSON = JSON.stringify(value);

  try {
    await runAsync(insertSQL, [key, valueJSON]);
  } catch (error) {
    console.error('Error during inserting into config table:', error);
  }
};

export const updateConfig = async (
  configItems: SystemConfig
) => {
  let insertSQL = `INSERT OR REPLACE INTO config (key, value) VALUES `;

  const valueTuples = [];
  const queryParams = [];

  if (!isValidConfig(configItems)) {
    console.log('Config is invalid');
    return;
  }

  for (const key of Object.keys(configItems)) {
    valueTuples.push(`(?, ?)`);
    queryParams.push(key, JSON.stringify(configItems[key as keyof SystemConfig]));
  }
  insertSQL += valueTuples.join(', ');

  try {
    await runAsync(insertSQL, queryParams);
    await shouldRestartServices(configItems);
  } catch (error) {
    console.error('Error during bulk inserting/updating config table:', error);
  }
};

export const shouldRestartServices = async (configItems: SystemConfig) => {
  const servicesToRestart: IServiceRestart = {};

  // If any of those keys updated, we need to restart object-detection service
  const objectDetectionConfigKeys = [
    'isDashcamMLEnabled', 
    // 'PrivacyModelPath', 
    // 'PrivacyModelHash', 
    // 'PrivacyConfThreshold', 
    // 'PrivacyNmsThreshold', 
    // 'PrivacyNumThreads'
  ];
  // const dataLoggerConfigKeys = ['...']

  for (const key of Object.keys(configItems)) {
    if (objectDetectionConfigKeys.includes(key)) {
      const currentVal = await getConfig(key);
      const newVal = configItems[key as keyof SystemConfig];
      if (currentVal != newVal) {
        servicesToRestart.objectDetection = true;
      }
    }
    // if (dataLoggerConfigKeys.includes(key)) {
    //   ...
    // }
  }
  
  if (servicesToRestart.objectDetection) {
    console.log('Config updated for object-detection service. Restaring');
    exec('systemctl restart object-detection');
  }
}

export const updateConfigKey = async (key: string, value: any) => {
  const insertSQL = `INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`;
  const valueJSON = JSON.stringify(value);

  try {
    await runAsync(insertSQL, [key, valueJSON]);
  } catch (error) {
    console.error('Error during inserting into config table:', error);
  }
};

export const getDefaultConfig = (): SystemConfig => {
  return defaultConfig;
};

/**
 * The purpose of this function to provide a safe-check for cases,
 * when SQLite read operation fails, and we can return the result of last successful read
 * Random BUSY or LOCKED errors are common for SQLite
 * @param key 
 * @returns cached value if exists, otherwise default value
 */
export const getCachedValue = (key: string) => {
  return cachedConfig[key] !== undefined ? cachedConfig[key] : defaultConfig[key as keyof SystemConfig];
}

let FAST_SPEED_COLLECTION_MODE = false;
export const getDX = () => {
  let dx = getCachedValue('DX');
  if (FAST_SPEED_COLLECTION_MODE) {
    dx *= 1.5;
  }
  return Math.round(dx);
}

let lastTimeChanged = 0;
export const setFastSpeedCollectionMode = (value: boolean) => {
  if (value !== FAST_SPEED_COLLECTION_MODE) {
    const period = lastTimeChanged ? Date.now() - lastTimeChanged : 0;
    lastTimeChanged = Date.now();
  }
  FAST_SPEED_COLLECTION_MODE = value;
}

export const getCutoffIndex = (currentDx: number) => {
  let dx = getCachedValue('DX');
  if (currentDx > dx) {
    return 1.5;
  }
  return 2;
}

export const isValidConfig = (_config: SystemConfig) => {
  const isValid =
    _config &&
    Number(_config.DX) &&
    Number(_config.MaxPendingTime) &&
    typeof _config.isCornerDetectionEnabled === 'boolean' &&
    typeof _config.isLightCheckDisabled === 'boolean' &&
    typeof _config.GnssFilter === 'object';

  _config.isLightCheckDisabled = false;
  return isValid;
};

