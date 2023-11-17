import { Database } from 'sqlite3';
import { fetchGnssLogsByTime } from './gnss';
import { fetchImuLogsByTime } from './imu';
import { IImage } from 'types';
import { getImagesForDateRange } from 'util/frames';
import { DB_PATH } from 'config';
import { GnssRecord, ImuRecord } from 'types/sqlite';

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
};

export const querySensorData = async (
  lastTimestamp: number,
): Promise<{ gnss: GnssRecord[], imu: ImuRecord[], images: IImage[]}> => {
  try {
    const logTime = Math.max(lastTimestamp, Date.now() - 60 * 1000);
    console.log('Getting sensor data for: ', new Date(logTime));
    const start = Date.now();
    const gnss = (await fetchGnssLogsByTime(logTime)).filter(g => g); // don't fetch more than a minute of data
    const since = gnss[0].system_time;
    const until = gnss[gnss.length - 1].system_time;

    const imu = await fetchImuLogsByTime(since, until);
    const images = await getImagesForDateRange(since, until);
    const duration = (until - since) / 1000;
    console.log(
      `Sensor data queried: ${gnss.length} GNSS, ${imu.length} IMU, ${images.length} images. Took ${Date.now() - start} msecs, Since: ${since}, Until: ${until}, Period: ${duration.toFixed(1)} secs. ${duration > 0 ? `Freq: GNSS ${(gnss.length / duration).toFixed(1)}, IMU ${(imu.length / duration).toFixed(1)}, Images ${(images.length / duration).toFixed(1)}, ` : ''}`,
    );
    return { gnss, imu, images };
  } catch (e: unknown) {
    console.log('Unknown sensor data fetch problem', e);
    return { gnss: [], imu: [], images: [] };
  }
};

export const createFrameKMTable = async (): Promise<void> => {
  const createTableSQL = `
  CREATE TABLE IF NOT EXISTS framekms (
    fkm_id INTEGER,
    image_name TEXT PRIMARY KEY NOT NULL,
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
    ml_model_hash TEXT,
    ml_detections TEXT
  );`;
  try {
    await runSchemaAsync(db, createTableSQL);
  } catch (error) {
    console.error('Error during initialisation of tables:', error);
    throw error;
  }
};

export const db: Database = connectDB(initialise);
