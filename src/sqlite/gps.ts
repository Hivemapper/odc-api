import { db } from './index';

export const fetchGnssLogsByTime  = (from: number, to: number): Promise<any[] | unknown> => {
    const query = `SELECT * FROM merged WHERE imu_time > ? AND imu_time < ?`;
    return new Promise((resolve, reject) => {
        db.all(query, [from, to], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

export const fetchGnssLogsById = (id: number): Promise<any[] | unknown> => {
    const query = `SELECT * FROM merged WHERE id > ?`;
    return new Promise((resolve, reject) => {
        db.all(query, [id], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

export const fetchLastNRecords = async (n: number): Promise<any[] | unknown> => {
    const query = `SELECT * FROM merged ORDER BY id DESC LIMIT ?`;
    return new Promise((resolve, reject) => {
        db.all(query, [n], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
    });
}