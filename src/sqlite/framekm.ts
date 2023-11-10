import { getConfig } from 'util/motionModel/config';
import { db, getAsync, runAsync } from './index';
import { FramesMetadata } from 'types/motionModel';

function getMaxFramesCount() {
  const {
    FrameKmLengthMeters,
    DX,
  } = getConfig();
  return Math.round(FrameKmLengthMeters / DX);
}

export const isFrameKmComplete = async (): Promise<boolean> => {
  try {
    const count = await getFramesCount();
    console.log('FRAMES READY: ' + count, count * getConfig().DX > getConfig().FrameKmLengthMeters);
    return count > getMaxFramesCount(); // Check if we have at least KM of data
  } catch (error) {
    console.error('Error checking if framekm is complete:', error);
    return false;
  }
};

export const getFramesCount = async (): Promise<number> => {
  try {
    const row: any = await getAsync(
      db,
      'SELECT COUNT(*) AS count FROM framekm;',
    );
    return row.length ? row[0].count : 0;
  } catch (error) {
    console.error('Error checking frames count:', error);
    return 0;
  }
};

export const isInProgress = async (): Promise<boolean> => {
  try {
    const count = await getFramesCount();
    return count > 0;
  } catch (error) {
    console.error('Error checking if framekm is not empty:', error);
    return false;
  }
};

export const getFrameKmMetadata = async (getAll = false): Promise<FramesMetadata[]> => {
  try {
    const limit = getMaxFramesCount();
    const rows: any = await getAsync(db, `SELECT * FROM framekm ORDER BY t${getAll ? '' : ' LIMIT ' + limit};`);
    return rows;
  } catch (error) {
    console.error('Error fetching framekm metadata:', error);
    return [];
  }
};

export const getPrevFrameKmTable = async (): Promise<FramesMetadata[]> => {
  try {
    const rows: any = await getAsync(db, 'SELECT * FROM prev_framekm ORDER BY t;');
    return rows;
  } catch (error) {
    console.error('Error fetching prev_framekm metadata:', error);
    return [];
  }
};

export const getLastTimestamp = async (): Promise<number> => {
  try {
    let row: any = await getAsync(
      db,
      'SELECT t FROM framekm ORDER BY t DESC LIMIT 1;',
    );
    if (row.length) {
      return row[0].t;
    }

    // If not found, try to get the last timestamp from the prev_framekm table
    row = await getAsync(
      db,
      'SELECT t FROM prev_framekm ORDER BY t DESC LIMIT 1;',
    );
    if (row.length) {
      return row[0].t;
    }

    return 0;
  } catch (error) {
    console.error('Error fetching last timestamp:', error);
    return Date.now();
  }
};

export const getExistingFramesMetadata = async (limit = 3): Promise<any[]> => {
  try {
    let rows: any = await getAsync(
      db,
      `SELECT * FROM framekm ORDER BY t DESC LIMIT ${limit};`,
    );

    if (rows?.length < limit) {
      // If no records are found in framekm, fetch from prev_framekm
      const prevRows: any = await getAsync(
        db,
        `SELECT * FROM prev_framekm ORDER BY t DESC LIMIT ${limit};`,
      );
      rows = rows.concat(prevRows);
    }

    return rows?.length ? rows.reverse() : []; // Returns either the last N records from framekm, prev_framekm, or an empty array
  } catch (error) {
    console.error('Error fetching frames:', error);
    return [];
  }
};

let metersTrimmed = 0;

export const addFramesToFrameKm = async (
  rows: FramesMetadata[],
  tableName = 'framekm',
): Promise<void> => {
  const { isTripTrimmingEnabled, TrimDistance } = getConfig();

  if (isTripTrimmingEnabled && metersTrimmed < TrimDistance) {
    const framesLeftToTrim = Math.ceil(
      (TrimDistance - metersTrimmed) / getConfig().DX,
    );
    const rowsToIgnore = rows.slice(0, framesLeftToTrim);
    metersTrimmed += rowsToIgnore.length * getConfig().DX;
    rows = rows.slice(framesLeftToTrim);
    console.log('TRIMMED: ', rowsToIgnore.length);
    await addFramesToFrameKm(rowsToIgnore, 'prev_framekm');
  }

  if (rows.length) {
    return new Promise(async (resolve, reject) => {
      const insertSQL = `
        INSERT INTO ${tableName} (
          bytes, name, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z,
          lat, lon, alt, speed, t, systemTime, satellites, dilution,
          eph
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;

      try {
        for (const row of rows) {
          await runAsync(db, insertSQL, [
            row.bytes,
            row.name,
            row.acc_x,
            row.acc_y,
            row.acc_z,
            row.gyro_x,
            row.gyro_y,
            row.gyro_z,
            row.lat,
            row.lon,
            row.alt,
            row.speed,
            Math.round(Number(row.t)),
            Math.round(Number(row.systemTime)),
            row.satellites,
            row.dilution,
            row.eph,
          ]);
        }
        resolve();
      } catch (error) {
        console.error('Error adding rows to framekm:', error);
        reject(error); 
      }
    });
  }
};

export const clearFrameKmTable = async (clearAll = false): Promise<void> => {
  try {
    const limit = getMaxFramesCount();
    await runAsync(db, 'DELETE FROM prev_framekm;');
    await runAsync(
      db,
      'INSERT INTO prev_framekm SELECT * FROM framekm;'
    );
    if (clearAll) {
      await runAsync(db, 'DELETE FROM framekm;');
    } else {
      await runAsync(db, `DELETE FROM framekm WHERE rowid IN (SELECT rowid FROM framekm ORDER BY t LIMIT ${limit});`);
    }
  } catch (error) {
    console.log(error);
  }
};

export const clearAll = async (): Promise<void> => {
  try {
    await runAsync(db, 'DELETE FROM prev_framekm;');
    await runAsync(db, 'DELETE FROM framekm;');
  } catch (error) {
    console.log(error);
  }
};

export const getFrameKmName = async (count = 0): Promise<string> => {
  try {
    const row: any = await getAsync(
      db,
      'SELECT t FROM framekm ORDER BY t LIMIT 1;',
    );
    console.log(row);
    if (row.length) {
      let formattedTime;
      try {
        formattedTime = new Date(Math.round(Number(row[0].t)))
          .toISOString()
          .replace(/[-:]/g, '')
          .replace('T', '_')
          .split('.')[0];
      } catch {
        return '';
      }
      return 'km_' + formattedTime + '_' + count + '_' + 0;
    } else {
      // We can't generate FrameKM Name for empty FrameKM table
      return '';
    }
  } catch (e) {
    console.log('Error getting the name', e);
    return '';
  }
};
