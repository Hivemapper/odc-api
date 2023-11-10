import { DB_PATH } from 'config';
import { Database } from 'sqlite3';

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
export const getAsync = (db: Database, sql: string, params = []) => {
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
};

export const createFrameKMTable = async (): Promise<void> => {
  const createTableSQL = `
  CREATE TABLE IF NOT EXISTS framekm (
    bytes INTEGER,
    name TEXT,
    acc_x REAL,
    acc_y REAL,
    acc_z REAL,
    gyro_x REAL,
    gyro_y REAL,
    gyro_z REAL,
    lat REAL,
    lon REAL,
    alt REAL,
    speed REAL,
    t INTEGER,
    systemTime INTEGER,
    satellites INTEGER,
    dilution REAL,
    eph REAL
  );`;
  try {
    await runSchemaAsync(db, createTableSQL);
    
    // prev_framekm table will hold the metadata of previous FrameKMs
    // That will help to reference the previous points for motion model,
    // And also to hold the metadata of multiple previous FrameKMs while ML is running
    const createPrevTableSQL = createTableSQL.replace(
      'framekm',
      'prev_framekm',
    );
    await runSchemaAsync(db, createPrevTableSQL);
  } catch (error) {
    console.error('Error during initialisation of tables:', error);
    throw error;
  }
};

export const db: Database = connectDB(initialise);
