import { db, getAsync, runAsync } from './index';
import { SystemConfig } from 'types/motionModel';
import { CAMERA_TYPE } from 'config';
import { CameraType } from 'types';

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
  isDashcamMLEnabled: false,
  isGyroCalibrationEnabled: false,
  isAccelerometerCalibrationEnabled: false,
  isTripTrimmingEnabled: true,
  TrimDistance: 100,
  FrameKmLengthMeters: 1000,
  privacyRadius: 200,
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
        ? await getAsync(db, selectSQL, keys)
        : await getAsync(db, selectSQL, [keys])
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
    const rows = (await getAsync(db, selectSQL)) as {
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
    await runAsync(db, insertSQL, queryParams);
  } catch (error) {
    console.error('Error during bulk inserting/updating config table:', error);
  }
};

export const updateConfigKey = async (key: string, value: any) => {
  const insertSQL = `INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`;
  const valueJSON = JSON.stringify(value);

  try {
    await runAsync(db, insertSQL, [key, valueJSON]);
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

export const isValidConfig = (_config: SystemConfig) => {
  const isValid =
    _config &&
    Number(_config.DX) &&
    Number(_config.MaxPendingTime) &&
    typeof _config.isCornerDetectionEnabled === 'boolean' &&
    typeof _config.isLightCheckDisabled === 'boolean' &&
    typeof _config.GnssFilter === 'object';

  _config.isLightCheckDisabled = false;
  _config.isDashcamMLEnabled = _config.isDashcamMLEnabled && CAMERA_TYPE === CameraType.HdcS; // FORCE ENABLE FOR HDC-S TESTING. TODO: REMOVE
  return isValid;
};

