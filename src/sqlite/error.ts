import { getDb, runAsync } from 'sqlite';
import { ErrorRecord } from 'types/sqlite';

export const fetchLastNErrorRecords = async (
  n: number,
): Promise<ErrorRecord[]> => {
  const query = `SELECT * FROM error_logs ORDER BY system_time DESC LIMIT ?`;
  const db = await getDb();
  return new Promise((resolve, reject) => {
    db.all(query, [n], (err: unknown, rows: ErrorRecord[]) => {
      if (err) {
        console.log(err);
        reject([]);
      } else {
        resolve(rows);
      }
    });
  });
};

export const insertErrorLog = async (message: string) => {
  const systemTime = formatDate(new Date()); // Current system time in the specified format

  const insertSQL = `INSERT OR IGNORE INTO error_logs (system_time, service_name, message) VALUES (?, ?, ?);`;
  try {
      await runAsync(insertSQL, [systemTime, 'odc-api', message]);
  } catch (err) {
      console.error("Error inserting into error_logs:", err);
      throw err;
  }
};

export const insertSensorFusionLog = async (errorType: string, errorMessage: string) => {
  const systemTime = formatDate(new Date()); // Current system time in the specified format

  const insertSQL = `INSERT OR IGNORE INTO sensor_fusion_logs (system_time, error_type, error_message) VALUES (?, ?, ?);`;
  try {
      await runAsync(insertSQL, [systemTime, errorType, errorMessage]);
  } catch (err) {
      console.error("Error inserting into sensor_fusion_logs:", err);
      throw err;
  }
};

const formatDate = (date: Date) => {
  const pad = (num: number, size: number) => num.toString().padStart(size, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1, 2); // months are zero-indexed
  const day = pad(date.getDate(), 2);
  const hours = pad(date.getHours(), 2);
  const minutes = pad(date.getMinutes(), 2);
  const seconds = pad(date.getSeconds(), 2);
  const milliseconds = pad(date.getMilliseconds(), 5);

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
};