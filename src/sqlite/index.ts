import { Database } from 'sqlite3';
import { DB_PATH } from 'config';

const MAX_RETRIES = 5;
const RETRY_INTERVAL = 2000;

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
          console.log('[SQLITE] CONNECT DB');
          await initialiseDB();
          resolve(db);
        }
      });
    });
  };

  while (attempts < MAX_RETRIES) {
    try {
      return await connect();
    } catch (err) {
      attempts++;
      if (attempts >= MAX_RETRIES) {
        throw err;
      }
      console.log(`[SQLITE] Retrying connection in ${RETRY_INTERVAL / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
    }
  }

  throw new Error('[SQLITE] Unable to connect to the database after maximum retries');
};

export const runAsync = async (sql: string, params: any[] = []) => {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
};

export const getAsync = async (sql: string, params: any[] = []) => {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
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
  await createFrameKMTable();
  await createHealthStateTable();
  await createFrameTable();
  await createConfigurationTable();
  await performSoftMigrations();
};

export const performSoftMigrations = async (): Promise<void> => {
  // add dx INTEGER field to framekm table, if doesn't exist, default to 0
  const addDxToFramekm = `ALTER TABLE framekms ADD COLUMN dx INTEGER DEFAULT 0;`;
  try {
    await runSchemaAsync(addDxToFramekm);
  } catch (error) {
    console.error('Error during adding dx field to framekms table:', error);
  }
}

export const createFrameKMTable = async (): Promise<void> => {
  const createTableSQL = `
  CREATE TABLE IF NOT EXISTS framekms (
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
