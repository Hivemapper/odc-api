import { Database } from 'sqlite3';
import { DB_PATH } from 'config';
import { ANONYMOUS_ID_FIELD, insertIntoDeviceInfo } from './deviceInfo';
import { generate } from 'shortid';

const MAX_RETRIES_CONNECT = 5;
const RETRY_INTERVAL_CONNECT = 2000;

const MAX_RETRIES_QUERY = 3;
const RETRY_INTERVAL_QUERY = 500;

let dbInstance: Database | null = null;
let connectionPromise: Promise<Database> | null = null;

export const getDb = async (): Promise<Database> => {
  if (!dbInstance) {
    if (!connectionPromise) {
      connectionPromise = connectDB(initialise);
    }
    try {
      dbInstance = await connectionPromise;
    } finally {
      connectionPromise = null;
    }
  }
  return dbInstance;
};

export const connectDB = async (initialiseDB: () => Promise<void>): Promise<Database> => {
  let attempts = 0;

  const connect = (): Promise<Database> => {
    return new Promise((resolve, reject) => {
      const db = new Database(DB_PATH, async (err) => {
        if (err) {
          console.error('[SQLITE] DB connect error on attempt', attempts, err.message);
          reject(err);
        } else {
          console.log('[LOG] CONNECT DB');
          dbInstance = db;
          await initialiseDB();
          resolve(db);
        }
      });
    });
  };

  while (attempts < MAX_RETRIES_CONNECT) {
    try {
      return await connect();
    } catch (err) {
      attempts++;
      if (attempts >= MAX_RETRIES_CONNECT) {
        throw err;
      }
      console.log(`[SQLITE] Retrying connection in ${RETRY_INTERVAL_CONNECT / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_CONNECT));
    }
  }

  throw new Error('[SQLITE] Unable to connect to the database after maximum retries');
};

export const queryDB = async <T>(query: string, args: any[]): Promise<T[]> => {
  const db = await getDb();
  return new Promise((resolve, reject) => {
      db.all(query, args, (err: unknown, rows: T[]) => {
          if (err) {
              reject([]);
          } else {
              resolve(rows);
          }
      });
  });
}

export const runAsync = async (sql: string, params: any[] = []) => {
  const db = await getDb();

  for (let attempt = 0; attempt < MAX_RETRIES_QUERY; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
          if (err) {
            reject(err);
          } else {
            if (attempt > 0) {
              console.log(`[SQLITE] Retry ${attempt + 1}: Operation successful after ${attempt} retries`);
            }
            resolve(this);
          }
        });
      });
    } catch (err: any) {
      if (err.code === 'SQLITE_BUSY' && attempt < MAX_RETRIES_QUERY - 1) {
        console.log(`[SQLITE] Retry ${attempt + 1}: Retrying operation in ${RETRY_INTERVAL_QUERY / 1000} seconds... Query: ${sql}`);
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_QUERY));
      } else {
        throw err;
      }
    }
  }
};

export const getAsync = async (sql: string, params: any[] = []) => {
  const db = await getDb();

  for (let attempt = 0; attempt < MAX_RETRIES_QUERY; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
    } catch (err: any) {
      if (err.code === 'SQLITE_BUSY' && attempt < MAX_RETRIES_QUERY - 1) {
        console.log(`[SQLITE] Retry ${attempt + 1}: Retrying operation in ${RETRY_INTERVAL_QUERY / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_QUERY));
      } else {
        throw err;
      }
    }
  }
};


export const runSchemaAsync = async (sql: string) => {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    db.run(sql, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
};

export const initialise = async (): Promise<void> => {
  console.log('LOG: Initialising tables');
  await createFrameKMTable('framekms');
  await createFrameKMTable('packed_framekms');
  await createHealthStateTable();
  await createFrameTable();
  await createConfigurationTable();
  await createDeviceInfoTable();
  console.log('LOG: Tables created');
  const anonymousId = generate();
  await insertIntoDeviceInfo(ANONYMOUS_ID_FIELD, anonymousId);
  await performSoftMigrations();
  console.log('LOG: migrated!');
};

export const performSoftMigrations = async (): Promise<void> => {
  const migrationCommands = [
    `ALTER TABLE framekms ADD COLUMN orientation INTEGER DEFAULT 1;`,
    `ALTER TABLE packed_framekms ADD COLUMN orientation INTEGER DEFAULT 1;`,
    `ALTER TABLE framekms ADD COLUMN dx INTEGER DEFAULT 0;`,
    `ALTER TABLE packed_framekms ADD COLUMN dx INTEGER DEFAULT 0;`,
    `ALTER TABLE framekms ADD COLUMN stationary REAL DEFAULT -1.0;`,
    `ALTER TABLE packed_framekms ADD COLUMN stationary REAL DEFAULT -1.0;`,
    // Add more ALTER TABLE commands here as needed
  ];

  for (const command of migrationCommands) {
    try {
      await runSchemaAsync(command);
      console.log(`Successfully executed migration command: ${command}`);
    } catch (error) {
      console.error(`Error during execution of migration command (${command}):`, error);
    }
  }
};


export const createFrameKMTable = async (tableName: string): Promise<void> => {
  const createTableSQL = `
  CREATE TABLE IF NOT EXISTS ${tableName} (
    fkm_id INTEGER,
    image_name TEXT PRIMARY KEY NOT NULL,
    image_path TEXT,
    acc_x REAL,
    acc_y REAL,
    acc_z REAL,
    gyro_x REAL,
    gyro_y REAL,
    gyro_z REAL,
    xdop REAL,
    ydop REAL,
    tdop REAL,
    vdop REAL,
    pdop REAL,
    gdop REAL,
    hdop REAL,
    eph REAL,
    latitude REAL,
    longitude REAL,
    altitude REAL,
    speed REAL,
    time INTEGER,
    frame_idx INTEGER,
    system_time INTEGER,
    satellites_used INTEGER,
    dilution REAL,
    created_at INTEGER,
    ml_model_hash TEXT,
    ml_detections TEXT,
    ml_read_time INTEGER,
    ml_write_time INTEGER,
    ml_inference_time INTEGER,
    ml_blur_time INTEGER,
    ml_downscale_time INTEGER,
    ml_upscale_time INTEGER,
    ml_mask_time INTEGER,
    ml_composite_time INTEGER,
    ml_load_time INTEGER,
    ml_transpose_time INTEGER,
    ml_letterbox_time INTEGER,
    ml_processed_at INTEGER,
    ml_grid INTEGER,
    postponed INTEGER DEFAULT 0,
    orientation INTEGER DEFAULT 1,
    error TEXT
  );`;
  try {
    await runSchemaAsync(createTableSQL);
  } catch (error) {
    console.error('Error during initialisation of tables:', error);
    throw error;
  }
};

export const createFrameTable = async (): Promise<void> => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS frames (
    system_time INTEGER PRIMARY KEY NOT NULL,
    image_name TEXT NOT NULL
    );`;
  try {
    await runSchemaAsync(createTableSQL);
  } catch (error) {
    console.error('Error during initialization of the frames table:', error);
    throw error;
  }
};

export const createConfigurationTable = async (): Promise<void> => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );`;
  try {
    await runSchemaAsync(createTableSQL);
  } catch (error) {
    console.error('Error during initialization of the config table:', error);
    throw error;
  }
};
export const createDeviceInfoTable = async (): Promise<void> => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS deviceInfo (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
    );`;
  try {
    await runSchemaAsync(createTableSQL);
  } catch (error) {
    console.error('Error during initialization of the device info table:', error);
    throw error;
  }
};

export const createHealthStateTable = async (): Promise<void> => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS health_state (
    service_name TEXT PRIMARY KEY NOT NULL,
    status TEXT NOT NULL
    );`;
  try {
    await runSchemaAsync(createTableSQL);
  } catch (error) {
    console.error('Error during initialization of the health state table:', error);
    throw error;
  }
};
