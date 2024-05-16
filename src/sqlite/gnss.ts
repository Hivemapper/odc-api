import { GnssRecord } from 'types/sqlite';
import { getDb } from './index';
import { convertTimestampToDbFormat } from 'util/index';
import { DEFAULT_TIME } from 'util/lock';

export const fetchGnssLogsByTime  = async (from: number, to?: number): Promise<GnssRecord[]> => {
    let query = `SELECT * FROM gnss WHERE time > ?`;
    const args = [convertTimestampToDbFormat(from)];

    if (to) {
        query += ` AND time < ?`;
        args.push(convertTimestampToDbFormat(to));
    }
    const db = await getDb();
    return new Promise((resolve) => {
        db.all(query, args, (err: unknown, rows: GnssRecord[]) => {
            if (err) {
                resolve([]);
            } else {
                resolve(rows.filter(r => r).map(r => { 
                    r.time = new Date(r.time + 'Z').getTime();
                    r.system_time = new Date(r.system_time + 'Z').getTime();
                    r.actual_system_time = new Date(r.actual_system_time + 'Z').getTime();
                    r.dilution = r.hdop;
                    return r;
                }));
            }
        });
    });
}

export const fetchGnssLogsById = async (id: number): Promise<GnssRecord[]> => {
    const query = `SELECT * FROM gnss WHERE id > ?`;
    const db = await getDb();
    return new Promise((resolve, reject) => {
        db.all(query, [id], (err: unknown, rows: GnssRecord[]) => {
            if (err) {
                console.log(err);
                reject([]);
            } else {
                resolve(rows);
            }
        });
    });
}

export const fetchLastNGnssRecords = async (n: number): Promise<GnssRecord[]> => {
    const query = `SELECT * FROM gnss ORDER BY id DESC LIMIT ?`;
    const db = await getDb();
    return new Promise((resolve, reject) => {
        db.all(query, [n], (err: unknown, rows: GnssRecord[]) => {
            if (err) {
                console.log(err);
                reject([]);
            } else {
                resolve(rows);
            }
          });
    });
}