import { getDb } from './index';
import { MagnetometerRecord } from 'types/sqlite';
import { convertTimestampToDbFormat } from 'util/index';

export const fetchMagnetometerLogsByTime  = async (from: number, to: number, session: string): Promise<MagnetometerRecord[]> => {
    let query = `SELECT * FROM magnetometer WHERE system_time > ? AND system_time < ? AND session = ?`;
    const args = [convertTimestampToDbFormat(from), convertTimestampToDbFormat(to), session];

    const db = await getDb();
    return new Promise((resolve) => {
        db.all(query, args, (err: unknown, rows: MagnetometerRecord[]) => {
            if (err) {
                console.log(err);
                resolve([]);
            } else {
                resolve(rows.filter(r => r).map(r => { 
                    r.system_time = new Date(r.system_time + 'Z').getTime();
                    return r;
                }));
            }
        });
    });
}

export const fetchLastNMagnetometerRecords = async (n: number): Promise<MagnetometerRecord[]> => {
    const query = `SELECT * FROM magnetometer ORDER BY id DESC LIMIT ?`;
    const db = await getDb();
    return new Promise((resolve, reject) => {
        db.all(query, [n], (err: unknown, rows: MagnetometerRecord[]) => {
            if (err) {
              reject([]);
            } else {
              resolve(rows);
            }
          });
    });
}