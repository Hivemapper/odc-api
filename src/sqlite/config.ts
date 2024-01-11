import { isValidConfig } from 'util/motionModel/config';
import { db, getAsync, runAsync } from './index';
import { SystemConfig } from 'types/motionModel';

export const getConfig = async (keys: string | string[]) => {
  const isArray = Array.isArray(keys);
  const selectSQL = isArray
    ? `SELECT key, value FROM config WHERE key IN (${keys
        .map(() => '?')
        .join(', ')})`
    : `SELECT value FROM config WHERE key = ?`;

  try {
    const rows = (
      isArray
        ? await getAsync(db, selectSQL, keys)
        : [await getAsync(db, selectSQL, [keys])]
    ) as { key: string; value: any }[];

    // Transform the result based on the input type
    if (isArray) {
      // Return an object with key-value pairs
      return rows.reduce((acc: any, row: any) => {
        acc[row.key] = JSON.parse(row.value);
        return acc;
      }, {});
    } else {
      // Return the value for the single key
      return rows[0] ? JSON.parse(rows[0].value) : undefined;
    }
  } catch (error) {
    console.error('Error during retrieving from config table:', error);
    return isArray ? {} : undefined;
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
      config[row.key] = JSON.parse(row.value);
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
