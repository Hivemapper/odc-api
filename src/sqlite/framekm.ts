import { db, getAsync, runAsync } from './index';
import { FrameKM, FrameKmRecord } from 'types/sqlite';
import { distance } from 'util/geomath';
import { join } from 'path';
import { FRAMES_ROOT_FOLDER, UNPROCESSED_FRAMEKM_ROOT_FOLDER } from 'config';
import { existsSync, promises } from 'fs';
import { isPrivateLocation } from 'util/privacy';
import { insertErrorLog } from './error';
import { Instrumentation } from 'util/instrumentation';
import { getConfig } from './config';

export const isFrameKmComplete = async (): Promise<boolean> => {
  try {
    const totalFrameKmsInTable = await getFrameKmsCount();
    return totalFrameKmsInTable > 1;
  } catch (error) {
    console.error('Error checking if framekm is complete:', error);
    return false;
  }
};

export const getFramesCount = async (): Promise<number> => {
  try {
    const row: any = await getAsync(
      db,
      'SELECT COUNT(*) AS count FROM framekms;',
    );
    return row.length ? row[0].count : 0;
  } catch (error) {
    console.error('Error checking frames count:', error);
    return 0;
  }
};

export const getFrameKmsCount = async (): Promise<number> => {
  const isDashcamMLEnabled = await getConfig('isDashcamMLEnabled');
  
  const query = `SELECT COUNT(DISTINCT fkm_id) AS distinctCount FROM framekms${
    isDashcamMLEnabled ? ' WHERE ml_model_hash IS NOT NULL' : ''
  };`;

  try {
    const row: any = await getAsync(
      db,
      query,
    );
    return row.length ? row[0].distinctCount : 0;
  } catch (error) {
    console.error('Error checking distinct fkm_id count:', error);
    return 0;
  }
};

export const getLatestFrameKmId = async (): Promise<number | undefined> => {
  try {
    const latestFkmIdRow: any = await getAsync(
      db,
      'SELECT MAX(fkm_id) AS latestFkmId FROM framekms;',
    );
    return latestFkmIdRow.length ? latestFkmIdRow[0].latestFkmId : null;
  } catch (error) {
    console.error('Error fetching latest fkm_id:', error);
    return undefined;
  }
};

export const getFirstFrameKmId = async (): Promise<number | undefined> => {
  try {
    const firstFkmIdRow: any = await getAsync(
      db,
      'SELECT MIN(fkm_id) AS firstFkmId FROM framekms;',
    );
    return firstFkmIdRow.length ? firstFkmIdRow[0].firstFkmId : null;
  } catch (error) {
    console.error('Error fetching first fkm_id:', error);
    return undefined;
  }
};

export const getCurrentFrameKm = async (): Promise<FrameKM> => {
  try {
    const fkmId = await getLatestFrameKmId();
    return await getFrameKm(fkmId);
  } catch (error) {
    console.error('Error fetching current frame km:', error);
    return [];
  }
};

export const getFrameKm = async (
  fkmId: number | undefined,
): Promise<FrameKM> => {
  if (!fkmId) {
    return [];
  }

  try {
    const rows = await getAsync(
      db,
      'SELECT * FROM framekms WHERE fkm_id = ? ORDER BY time;',
      [fkmId],
    );
    return rows as FrameKM;
  } catch (error) {
    console.error('Error fetching current framekm:', error);
    return [];
  }
};

export const getAllFrameKms = async (): Promise<FrameKM> => {
  try {
    const rows = await getAsync(db, 'SELECT * FROM framekms ORDER BY time DESC;');
    return rows as FrameKM;
  } catch (error) {
    console.error('Error fetching current framekm:', error);
    return [];
  }
};

export const clearAll = async (): Promise<boolean> => {
  try {
    await runAsync(db, 'DELETE FROM framekms;');
    return true;
  } catch (error) {
    console.error('Error clearing framekms table:', error);
    return false;
  }
};

export const deleteFrameKm = async (
  fkmId: number | undefined,
): Promise<boolean> => {
  if (!fkmId) {
    console.error('No fkmId provided for deletion');
    return false;
  }

  try {
    await runAsync(db, 'DELETE FROM framekms WHERE fkm_id = ?;', [fkmId]);
    return true;
  } catch (error) {
    console.error('Error deleting framekm:', error);
    return false;
  }
};

export const getLastTimestamp = async (): Promise<number> => {
  try {
    const lastRecord = await getLastRecord();
    return lastRecord?.system_time || 0;
  } catch (error) {
    console.error('Error fetching last timestamp:', error);
    return Date.now();
  }
};

export const getLastRecord = async (): Promise<any> => {
  try {
    const row: any = await getAsync(
      db,
      'SELECT * FROM framekms ORDER BY time DESC LIMIT 1;',
    );
    return row && row.length && row[0].longitude ? row[0] : null;
  } catch (error) {
    console.error('Error fetching last inserted record:', error);
    return null;
  }
};

// Returns either the last N records from framekm, or prev_framekm, or an empty array
export const getExistingFramesMetadata = async (limit = 3): Promise<any[]> => {
  try {
    const rows: any = await getAsync(
      db,
      `SELECT * FROM framekms ORDER BY time DESC LIMIT ${limit};`,
    );

    return rows?.length ? rows.reverse() : [];
  } catch (error) {
    console.error('Error fetching frames:', error);
    return [];
  }
};

let metersTrimmed = 0;

export const addFramesToFrameKm = async (
  rows: FrameKmRecord[],
  force = false,
): Promise<void> => {
  console.log(
    'GOING TO ADD ' + rows.length + ' FRAMES. ' + (force ? ' FORCED!!' : ''),
  );
  const { 
    isTripTrimmingEnabled, 
    TrimDistance, 
    DX, 
    FrameKmLengthMeters 
  } = await getConfig(['isTripTrimmingEnabled', 'TrimDistance', 'DX', 'FrameKmLengthMeters']);

  if (isTripTrimmingEnabled && metersTrimmed < TrimDistance) {
    const framesLeftToTrim = Math.ceil(
      (TrimDistance - metersTrimmed) / DX,
    );
    const rowsToIgnore = rows.slice(0, framesLeftToTrim);
    metersTrimmed += rowsToIgnore.length * DX;
    rows = rows.slice(framesLeftToTrim);
    console.log('TRIMMED ' + rowsToIgnore.length);
  }

  if (rows.length) {
    return new Promise(async (resolve) => {
      const insertSQL = `
        INSERT INTO framekms (
          fkm_id, image_name, image_path, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z,
          latitude, longitude, altitude, speed, 
          hdop, gdop, pdop, tdop, vdop, xdop, ydop,
          time, system_time, satellites_used, dilution, eph, frame_idx, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (await isPrivateLocation(row.latitude, row.longitude)) {
          console.log('PRIVATE ZONE. Ignored');
          continue;
        }
        try {
          const last = await getLastRecord();
          let fkm_id = 1;
          let frame_idx = 1;
          if (last && last.fkm_id) {
            console.log('surprise, last inserted: ', last.fkm_id, last.frame_idx);
            const lastFkmId = Number(last.fkm_id) || 1;
            const forceFrameKmSwitch = force && i === 0;
            fkm_id = forceFrameKmSwitch ? lastFkmId + 1 : lastFkmId;
            // sanity check for accidental insert of the wrong sample into framekm
            const distanceBetweenFrames = distance(last, row);
            if (
              distanceBetweenFrames > DX * 2 &&
              !forceFrameKmSwitch
            ) {
              insertErrorLog('Distance between frames is more than allowed: ' + distanceBetweenFrames);
              Instrumentation.add({
                event: 'DashcamCutReason',
                message: JSON.stringify({
                  reason: 'FrameKmValidation',
                  distance: Math.round(distanceBetweenFrames),
                }),
              });
              fkm_id++;
            }
            if (fkm_id === lastFkmId) {
              frame_idx = Number(last.frame_idx) + 1;
            }
            if (frame_idx > Math.round(FrameKmLengthMeters / DX)) {
              console.log('FRAMEKM IS COMPLETE!! SWITCHING TO NEXT ONE.');
              fkm_id++;
              frame_idx = 1;
            }
          }
          // Move frame
          const destination = join(
            UNPROCESSED_FRAMEKM_ROOT_FOLDER,
            String(fkm_id),
          );
          if (!existsSync(destination)) {
            await promises.mkdir(destination, { recursive: true });
          }
          await promises.copyFile(
            join(FRAMES_ROOT_FOLDER, row.image_name),
            join(destination, row.image_name),
          );
          console.log('About to add frame: ', row.image_name, fkm_id, frame_idx);

          await runAsync(db, insertSQL, [
            fkm_id,
            row.image_name,
            destination,
            row.acc_x,
            row.acc_y,
            row.acc_z,
            row.gyro_x,
            row.gyro_y,
            row.gyro_z,
            row.latitude,
            row.longitude,
            row.altitude,
            row.speed,
            row.hdop,
            row.gdop,
            row.pdop,
            row.tdop,
            row.vdop,
            row.xdop,
            row.ydop,
            Math.round(Number(row.time)),
            Math.round(Number(row.system_time)),
            row.satellites_used,
            row.dilution,
            row.eph,
            frame_idx,
            Date.now(),
          ]);
        } catch (error) {
          console.error('Error adding row to framekm:', error);
        }
      }
      resolve();
    });
  }
};

export const clearOutdated = async (): Promise<void> => {
  try {
    // Calculate the timestamp for 3 days ago
    const threeDaysAgo = Date.now() - 3 * 1000 * 60 * 60 * 24;

    // Construct the SQL query to delete records older than 3 days
    const deleteQuery = `
      DELETE FROM framekm 
      WHERE time < ?;
    `;

    // Execute the query with the timestamp parameter
    await runAsync(db, deleteQuery, [threeDaysAgo]);

    console.log('Outdated records cleared.');
  } catch (error) {
    console.error('Error clearing outdated records:', error);
  }
};

export const getFrameKmName = async (
  fkmId: number | undefined,
): Promise<string> => {
  try {
    if (!fkmId) {
      return '';
    }
    const rows: any = await getFrameKm(fkmId);
    if (rows.length) {
      let formattedTime;
      try {
        formattedTime = new Date(Math.round(Number(rows[0].time)))
          .toISOString()
          .replace(/[-:]/g, '')
          .replace('T', '_')
          .split('.')[0];
      } catch {
        return '';
      }
      return 'km_' + formattedTime;
    } else {
      // We can't generate FrameKM Name for empty FrameKM table
      return '';
    }
  } catch (e) {
    console.log('Error getting the name', e);
    return '';
  }
};
