import { Database } from 'sqlite3';
import { DB_PATH } from 'config';

export const connectDB = (callback?: () => void): Database => {
  console.log('[SQLITE] CONNECT DB');
  return new Database(DB_PATH, err => {
    if (err) {
      console.error('[SQLITE] DB connect error', err.message);
      throw err;
    } else {
      callback?.();
    }
  });
};

export const listAllTables = (callback: (tables: string[]) => void): void => {
  const query = "SELECT name FROM sqlite_master WHERE type='table';";

  // Array to store the names of all tables
  const tables: string[] = [];

  db.each(
    query,
    (err: any, row: any) => {
      if (err) {
        console.error('[SQLITE] Error fetching tables', err.message);
        return;
      }
      tables.push(row.name);
    },
    (err: any) => {
      // This callback gets executed when all rows have been retrieved
      if (err) {
        console.error(
          '[SQLITE] Error completing the fetch operation',
          err.message,
        );
        return;
      }
      callback(tables);
    },
  );
};

// Helper function to promisify db.run
export const runAsync = (db: Database, sql: string, params: any[] = []) => {
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

// Helper function to promisify db.all for running SELECT queries
export const getAsync = (db: Database, sql: string, params: any[] = []) => {
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

export const runSchemaAsync = (db: Database, sql: string) => {
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
};

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
    ml_processed_at INTEGER
  );`;
  try {
    await runSchemaAsync(db, createTableSQL);
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
    await runSchemaAsync(db, createTableSQL);
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
    await runSchemaAsync(db, createTableSQL);
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
    await runSchemaAsync(db, createTableSQL);
  } catch (error) {
    console.error('Error during initialization of the health state table:', error);
    throw error;
  }
};

export const db: Database = connectDB(initialise);
