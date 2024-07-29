import { getDb, queryDB } from './index';
import { ImuRecord } from 'types/sqlite';
import { convertTimestampToDbFormat } from 'util/index';

// Query functions for raw IMU data
export const fetchImuLogsByTime  = async (from: number, to: number, session: string): Promise<ImuRecord[]> => {
    const query = `SELECT * FROM imu WHERE time > ? AND time < ? AND session = ?`;
    const args = [convertTimestampToDbFormat(from), convertTimestampToDbFormat(to), session];

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
    return queryDB<ImuRecord>(query, [id]);
}


export const fetchLastNImuRecords = async (n: number): Promise<ImuRecord[]> => {
    const query = `SELECT * FROM imu ORDER BY id DESC LIMIT ?`;
    return queryDB<ImuRecord>(query, [n]);
}

// Query functions for processed IMU data
export const fetchProcessedImuLogsByTime  = async (from: number, to: number, session: string): Promise<ImuRecord[]> => {
    const query = `SELECT * FROM imu_processed WHERE time > ? AND time < ? AND session = ?`;
    const args = [convertTimestampToDbFormat(from), convertTimestampToDbFormat(to), session];

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

export const fetchProcessedImuLogsById = async (id: number): Promise<ImuRecord[]> => {
    const query = `SELECT * FROM imu_processed WHERE id > ?`;
    return queryDB<ImuRecord>(query, [id]);
}


export const fetchLastNProcessedImuRecords = async (n: number): Promise<ImuRecord[]> => {
    const query = `SELECT * FROM imu_processed ORDER BY id DESC LIMIT ?`;
    return queryDB<ImuRecord>(query, [n]);
}