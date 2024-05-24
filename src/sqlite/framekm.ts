import { getAsync, getDb, runAsync } from './index';
import { FrameKM, FrameKmRecord, GnssRecord } from 'types/sqlite';
import { distance } from 'util/geomath';
import { join } from 'path';
import { FRAMES_ROOT_FOLDER, UNPROCESSED_FRAMEKM_ROOT_FOLDER } from 'config';
import { existsSync, promises } from 'fs';
import { isPrivateLocation } from 'util/privacy';
import { insertErrorLog } from './error';
import { Instrumentation } from 'util/instrumentation';
import { getConfig, getCutoffIndex, getDX, setConfig } from './config';
import { MAX_PER_FRAME_BYTES, MIN_PER_FRAME_BYTES } from 'util/framekm';
import { fetchGnssWithCleanHeading } from './gnss';

export const isFrameKmComplete = async (
  mlEnabled = false,
): Promise<boolean> => {
  try {
    const totalFrameKmsInTable = await getFrameKmsCount(mlEnabled);
    return totalFrameKmsInTable > 1;
  } catch (error) {
    console.error('Error checking if framekm is complete:', error);
    return false;
  }
};

export const getFramesCount = async (): Promise<number> => {
  try {
    const row: any = await getAsync('SELECT COUNT(*) AS count FROM framekms;');
    return row.length ? row[0].count : 0;
  } catch (error) {
    console.error('Error checking frames count:', error);
    return 0;
  }
};

export const getEstimatedProcessingTime = async (): Promise<number> => {
  try {
    // SQL query with conditional aggregation
    const query = `
      SELECT
        SUM(CASE WHEN speed <= 17 THEN 1 ELSE 0 END) AS speed_low,
        SUM(CASE WHEN speed > 17 THEN 1 ELSE 0 END) AS speed_high
      FROM framekms WHERE ml_model_hash IS NULL AND error IS NULL AND postponed != 1;
    `;
    const rows: any = await getAsync(query);

    // Assuming 'rows' will have a single record with the counts
    if (rows && rows.length > 0) {
      const speedLow = rows[0].speed_low || 0;
      const speedHigh = rows[0].speed_high || 0;
      return Math.round(speedLow * 0.6 + speedHigh * 0.3);
    }
    return 0;
  } catch (error) {
    console.error('Error checking frames count:', error);
    return 0;
  }
};

export const getFrameKmsCount = async (mlEnabled = false): Promise<number> => {
  const query = `SELECT COUNT(DISTINCT fkm_id) AS distinctCount FROM framekms${
    mlEnabled
      ? ' WHERE (ml_model_hash IS NOT NULL OR error IS NOT NULL) AND postponed = 0'
      : ''
  };`;

  try {
    const row: any = await getAsync(query);
    return row.length ? row[0].distinctCount : 0;
  } catch (error) {
    console.error('Error checking distinct fkm_id count:', error);
    return 0;
  }
};

export const getFirstFrameKmId = async (
  mlEnabled = false,
): Promise<number | undefined> => {
  try {
    const query = `SELECT fkm_id FROM framekms${
      mlEnabled ? ' WHERE postponed = 0' : ''
    } ORDER BY time LIMIT 1;`;
    const firstFkmIdRow: any = await getAsync(query);
    return firstFkmIdRow.length ? firstFkmIdRow[0].fkm_id : null;
  } catch (error) {
    console.error('Error fetching first fkm_id:', error);
    return undefined;
  }
};

export const getLastFrameKmId = async (): Promise<number | undefined> => {
  try {
    const query = `SELECT fkm_id FROM framekms ORDER BY time DESC LIMIT 1;`;
    const lastFkmIdRow: any = await getAsync(query);
    return lastFkmIdRow.length ? lastFkmIdRow[0].fkm_id : null;
  } catch (error) {
    console.error('Error fetching first fkm_id:', error);
    return undefined;
  }
};

export const getFirstPostponedFrameKm = async (): Promise<
  number | undefined
> => {
  try { 
    const firstPostponed: any = await getAsync(
      `SELECT fkm_id AS firstFkmId FROM framekms WHERE postponed = 1 ORDER BY time LIMIT 1;`,
    );
    return firstPostponed.length ? firstPostponed[0].fkm_id : null;
  } catch (error) {
    console.error('Error fetching postponed fkm_id:', error);
    return undefined;
  }
};

export const postponeFrameKm = async (frameKmId: number): Promise<boolean> => {
  try {
    await runAsync('UPDATE framekms SET postponed = 1 WHERE fkm_id = ?;', [
      frameKmId,
    ]);
    return true;
  } catch (error) {
    console.error('Error clearing framekms table:', error);
    return false;
  }
};

export const postponeEndTrim = async (frameKmId: number): Promise<boolean> => {
  try {
    await runAsync('UPDATE framekms SET postponed = 2 WHERE fkm_id = ?;', [
      frameKmId
    ]);
    return true;
  } catch (error) {
    console.error('Error postponing the end trim:', error);
    return false;
  }
};

export const restoreEndTrim = async (): Promise<boolean> => {
  try {
    await runAsync('UPDATE framekms SET postponed = 0 WHERE postponed = 2;');
    return true;
  } catch (error) {
    console.error('Error restoring the end trim:', error);
    return false;
  }
};

export const moveFrameKmBackToQueue = async (
  frameKmId: number,
): Promise<boolean> => {
  try {
    await runAsync(
      'UPDATE framekms SET postponed = 0, error = "" WHERE fkm_id = ?;',
      [frameKmId],
    );
    return true;
  } catch (error) {
    console.error('Error clearing framekms table:', error);
    return false;
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
      'SELECT * FROM framekms WHERE fkm_id = ? ORDER BY time;',
      [fkmId],
    );
    return rows as FrameKM;
  } catch (error) {
    console.error('Error fetching current framekm:', error);
    return [];
  }
};

export const cleanHeadingsForFrameKm = async (fkmId: number): Promise<void> => {
  const frameKm: FrameKmRecord[] = await getFrameKm(fkmId);
  if (frameKm.length < 2) {
      console.log('No FrameKM data found for the given ID');
      return;
  }

  const startTime = frameKm[0].system_time;
  const endTime = frameKm[frameKm.length - 1].system_time;

  const gnssRecords: { heading: number | null, time: number }[] = await fetchGnssWithCleanHeading(startTime - 10 * 1000, endTime + 10 * 1000);
  if (gnssRecords.length === 0) {
      console.log('No GNSS data available within the time window.');
      return;
  }

  for (const frame of frameKm) {
      const interpolatedHeading = interpolateHeading(frame.system_time, gnssRecords);
      if (interpolatedHeading == null) {
          console.log('Unable to interpolate heading for system_time', frame.system_time);
          continue;
      }

      try {
          const updateSQL = 'UPDATE framekms SET heading = ? WHERE image_name = ?';
          await runAsync(updateSQL, [interpolatedHeading, frame.image_name]);
          console.log('FrameKM heading updated successfully for image_name', frame.image_name);
      } catch (error) {
          console.error('Error updating FrameKM record:', error);
      }
  }
};

function interpolateHeading(targetTime: number, gnssRecords: { heading: number | null, time: number }[]): number | null {
  let before: { heading: number, time: number } | null = null;
  let after: { heading: number, time: number } | null = null;

  for (const record of gnssRecords) {
      if (record.time <= targetTime && record.heading != null) {
          before = record as { heading: number, time: number };
      } else {
          after = record as { heading: number, time: number };
          break;
      }
  }

  if (!before || !after) {
      return before ? before.heading : after ? after.heading : null;
  }

  const timeRatio = (targetTime - before.time) / (after.time - before.time);
  const headingDiff = after.heading - before.heading;
  return before.heading + timeRatio * headingDiff;
}

export const getPostponedEndTrim = async (): Promise<FrameKM> => {
  try {
    const rows = await getAsync('SELECT * FROM framekms WHERE postponed = 2 ORDER BY time;');
    return rows as FrameKM;
  } catch (error) {
    console.error('Error fetching current framekm:', error);
    return [];
  }
};

export const getAllFrameKms = async (): Promise<FrameKM> => {
  try {
    const rows = await getAsync('SELECT * FROM framekms ORDER BY time DESC;');
    return rows as FrameKM;
  } catch (error) {
    console.error('Error fetching current framekm:', error);
    return [];
  }
};

export const clearAll = async (): Promise<boolean> => {
  try {
    await runAsync('DELETE FROM framekms;');
    return true;
  } catch (error) {
    console.error('Error clearing framekms table:', error);
    return false;
  }
};

export const deleteFrame = async (imageName: string, imagePath: string): Promise<boolean> => {
  try {
    await runAsync('DELETE FROM framekms WHERE image_name = ?;', [imageName]);
    await promises.rm(join(imagePath, imageName));
    return true;
  } catch (error) {
    console.error('Error deleting framekm:', error);
    return false;
  }
}

export const deleteFrameKm = async (
  fkmId: number | undefined,
): Promise<boolean> => {
  if (!fkmId) {
    console.error('No fkmId provided for deletion');
    return false;
  }

  const copySQL = `
    INSERT INTO packed_framekms
    SELECT * FROM framekms WHERE fkm_id = ?;
  `;

  try {
    await runAsync(copySQL, [fkmId]);
    await maintainPackedFrameKmTable();
  } catch (error) {
    console.error('Error copying rows:', error);
  }

  try {
    await runAsync('DELETE FROM framekms WHERE fkm_id = ?;', [fkmId]);
    console.log('Succesfully deleted: ', fkmId);
  } catch (error) {
    console.error('Error deleting framekm:', error);
  }

  try {
    const framesFolder = join(
      UNPROCESSED_FRAMEKM_ROOT_FOLDER,
      String(fkmId),
    );
    await promises.rmdir(framesFolder, { recursive: true });
    return true;
  } catch (e: unknown) {
    console.error('Error deleting framekm folder:', e);
    return false;
  }
};

export const maintainPackedFrameKmTable = async (): Promise<void> => {
  const maxRows = 5000;
  const checkRowCountSQL = `
    SELECT COUNT(*) AS row_count FROM packed_framekms;
  `;

  try {
    const result: any = await getAsync(checkRowCountSQL);
    if (result?.length) {
      const currentRowCount = result[0].row_count;
      if (currentRowCount && currentRowCount > maxRows) {
        const rowsToDelete = currentRowCount - maxRows;
  
        const deleteOldestSQL = `
          DELETE FROM packed_framekms WHERE image_name IN (
            SELECT image_name FROM packed_framekms ORDER BY created_at ASC LIMIT ?
          );
        `;
        await runAsync(deleteOldestSQL, [rowsToDelete]);
        console.log(`${rowsToDelete} old rows deleted from framekms to maintain row limit.`);
      }
    }
  } catch (error) {
    console.error('Error maintaining packed_framekm table:', error);
  }
};

export const getLastTimestamp = async (): Promise<number> => {
  try {
    const lastRecord = await getLastRecord();
    return lastRecord?.time || 0;
  } catch (error) {
    console.error('Error fetching last timestamp:', error);
    return Date.now();
  }
};

export const getLastRecord = async (): Promise<any> => {
  try {
    const row: any = await getAsync(
      'SELECT * FROM framekms ORDER BY time DESC LIMIT 1;',
    );
    return row && row.length && row[0].fkm_id ? row[0] : null;
  } catch (error) {
    console.error('Error fetching last inserted record:', error);
    return null;
  }
};

export const getFirstRecord = async (): Promise<any> => {
  try {
    const row: any = await getAsync(
      'SELECT * FROM framekms ORDER BY time LIMIT 1;',
    );
    return row && row.length && row[0].fkm_id ? row[0] : null;
  } catch (error) {
    console.error('Error fetching last inserted record:', error);
    return null;
  }
};

// Returns either the last N records from framekm, or prev_framekm, or an empty array
export const getExistingFramesMetadata = async (limit = 3): Promise<any[]> => {
  try {
    const rows: any = await getAsync(
      `SELECT * FROM framekms ORDER BY time DESC LIMIT ${limit};`,
    );

    return rows ? rows.reverse() : [];
  } catch (error) {
    console.error('Error fetching frames:', error);
    return [];
  }
};

let metersTrimmed = 0;
let ignoreTrim = false;

export const ignoreTrimStart = () => {
  ignoreTrim = true;
}

export const addFramesToFrameKm = async (
  rows: FrameKmRecord[],
  force = false,
): Promise<void> => {
  console.log(
    'GOING TO ADD ' + rows.length + ' FRAMES. ' + (force ? ' FORCED!!' : ''),
  );
  const { isTripTrimmingEnabled, TrimDistance, FrameKmLengthMeters } =
    await getConfig([
      'isTripTrimmingEnabled',
      'TrimDistance',
      'FrameKmLengthMeters'
    ]);
  const DX = getDX();

  if (isTripTrimmingEnabled && metersTrimmed < TrimDistance) {
    if (ignoreTrim) {
      metersTrimmed = TrimDistance;
    } else {
      const framesLeftToTrim = Math.ceil((TrimDistance - metersTrimmed) / DX);
      const rowsToIgnore = rows.slice(0, framesLeftToTrim);
      metersTrimmed += rowsToIgnore.length * DX;
      rows = rows.slice(framesLeftToTrim);
      console.log('START TRIMMED ' + rowsToIgnore.length);
    }
  }

  if (rows.length) {
    return new Promise(async resolve => {
      const insertSQL = `
        INSERT INTO framekms (
          fkm_id, image_name, image_path, dx, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z,
          latitude, longitude, altitude, speed, 
          hdop, gdop, pdop, tdop, vdop, xdop, ydop,
          time, system_time, clock, satellites_used, dilution, eph, frame_idx, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (await isPrivateLocation(row.latitude, row.longitude)) {
          console.log('PRIVATE ZONE. Ignored');
          continue;
        }
        try {
          const framePath = join(FRAMES_ROOT_FOLDER, row.image_name);
          const stat = await promises.stat(framePath);
          if (stat.size < MIN_PER_FRAME_BYTES || stat.size > MAX_PER_FRAME_BYTES) {
            Instrumentation.add({
              event: 'DashcamCutReason',
              message: JSON.stringify({
                reason: 'FrameSize',
                size: stat.size,
              }),
            });
            continue;
          }
          const last = await getLastRecord();
          let fkm_id = 1;
          let frame_idx = 1;
          let cutoffIndex = getCutoffIndex(DX);

          if (last && last.fkm_id) {
            const lastFkmId = Number(last.fkm_id) || 1;
            const forceFrameKmSwitch = force && i === 0;
            fkm_id = forceFrameKmSwitch ? lastFkmId + 1 : lastFkmId;
            // sanity check for accidental insert of the wrong sample into framekm
            const distanceBetweenFrames = distance(last, row);
            if (row.dx !== last.dx) {
              Instrumentation.add({
                event: 'DashcamCutReason',
                message: JSON.stringify({
                  reason: 'ChangedDX',
                  prev: last.dx,
                  current: row.dx,
                }),
              });
              fkm_id++;
            } else if (distanceBetweenFrames > DX * cutoffIndex && !forceFrameKmSwitch) {
              insertErrorLog(
                'Distance between frames is more than allowed: ' +
                  distanceBetweenFrames,
              );
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
            if (fkm_id !== lastFkmId) {
              try {
                await cleanHeadingsForFrameKm(lastFkmId);
              } catch (error) {
                console.error('Error cleaning headings:', error);
              }
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
            framePath,
            join(destination, row.image_name),
          );
          console.log(
            'About to add frame: ',
            row.image_name,
            fkm_id,
            frame_idx,
          );
          let clock = 0;
          const parts = row.image_name.split('_');
          if (parts.length === 3) {
            clock = Number(parts[2].replace('.jpg', ''));
          }

          await runAsync(insertSQL, [
            fkm_id,
            row.image_name,
            destination,
            row.dx,
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
            Math.round(Number(clock)),
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
