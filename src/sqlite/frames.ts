import { getDb, runAsync } from 'sqlite';
import { IImage } from 'types';

export const getFramesFromDb = async (since: number, until?: number): Promise<IImage[]> => {
  let query = `SELECT * FROM frames WHERE system_time > ?`;
  const args = [since];

  if (until) {
    query += ` AND system_time < ?`;
    args.push(until);
  }

  const db = await getDb();
  return new Promise((resolve) => {
    db.all(query, args, (err, rows: IImage[]) => {
      if (err) {
        console.error('Error fetching frames:', err);
        resolve([]);
      } else {
        resolve(rows);
      }
    });
  });
};

let insertedTimes = 0;
export const insertFrames = async (frames: IImage[]): Promise<void> => {
  const batchSize = 100;
  try {
    const sanitizedFrames = frames.filter(
      frame =>
        typeof frame.system_time === 'number' && frame.system_time > 0 &&
        typeof frame.image_name === 'string',
    );
    insertedTimes++;
    if (insertedTimes > 10) {
      // first, purge the table
      insertedTimes = 0;
      await deleteOldestFrames();
    }

    for (let i = 0; i < sanitizedFrames.length; i += batchSize) {
      const batch = sanitizedFrames.slice(i, i + batchSize);

      const placeholders = batch.map(() => '(?, ?)').join(', ');
      const values = batch.flatMap(frame => [
        frame.system_time,
        frame.image_name,
      ]);

      const insertSQL = `INSERT OR IGNORE INTO frames (system_time, image_name) VALUES ${placeholders};`;
      await runAsync(insertSQL, values);
    }
    console.log(sanitizedFrames.length + ' frames inserted.');
  } catch (error) {
    console.error('Error while batch inserting frames:', error);
  }
};

export const deleteOldestFrames = async (): Promise<void> => {
  const deleteSQL = `
    DELETE FROM frames WHERE system_time IN (
      SELECT system_time FROM frames ORDER BY system_time ASC LIMIT (
        SELECT CASE 
          WHEN COUNT(*) > 60000 THEN COUNT(*) - 60000
          ELSE 0
        END FROM frames
      )
    );
  `;

  try {
    await runAsync(deleteSQL);
    console.log('Frames table successfully purged');
  } catch (error) {
    console.error('Error while deleting oldest frames:', error);
  }
};
