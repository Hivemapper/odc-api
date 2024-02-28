import { getDb } from './index';
import { ImuRecord } from 'types/sqlite';
import { convertTimestampToDbFormat } from 'util/index';

export const fetchImuLogsByTime  = async (from: number, to?: number): Promise<ImuRecord[]> => {
    let query = `SELECT * FROM imu WHERE time > ?`;
    const args = [convertTimestampToDbFormat(from)];

    if (to) {
        query += ` AND time < ?`;
        args.push(convertTimestampToDbFormat(to));
    }
    const db = await getDb();
    return new Promise((resolve) => {
        db.all(query, args, (err: unknown, rows: ImuRecord[]) => {
            if (err) {
                console.log(err);
                resolve([]);
            } else {
                resolve(rows.filter(r => r).map(r => { 
                    r.system_time = new Date(r.time + 'Z').getTime();
                    return r;
                }));
            }
        });
    });
}

export const fetchImuLogsById = async (id: number): Promise<ImuRecord[]> => {
    const query = `SELECT * FROM imu WHERE id > ?`;
    const db = await getDb();
    return new Promise((resolve, reject) => {
        db.all(query, [id], (err: unknown, rows: ImuRecord[]) => {
            if (err) {
                reject([]);
            } else {
                resolve(rows);
            }
        });
    });
}

export const fetchLastNImuRecords = async (n: number): Promise<ImuRecord[]> => {
    const query = `SELECT * FROM imu ORDER BY id DESC LIMIT ?`;
    const db = await getDb();
    return new Promise((resolve, reject) => {
        db.all(query, [n], (err: unknown, rows: ImuRecord[]) => {
            if (err) {
              reject([]);
            } else {
              resolve(rows);
            }
          });
    });
}