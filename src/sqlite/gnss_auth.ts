import { db } from './index';
import { GnssAuthRecord } from 'types/sqlite';
import { convertTimestampToDbFormat } from 'util/index';


export const fetchGnssAuthLogsByTime  = async (from: number, to?: number, limit?: number): Promise<GnssAuthRecord[]> => {
    let query = `SELECT * FROM gnss_auth WHERE system_time > ?`;
    const args = [convertTimestampToDbFormat(from)];

    if (to) {
        query += ` AND system_time < ?`;
        args.push(convertTimestampToDbFormat(to));
    }

    if (limit) {
        query += ` LIMIT ?`
        args.push(String(limit));
    }

    return new Promise((resolve) => {
        db.all(query, args, (err: unknown, rows: GnssAuthRecord[]) => {
            if (err) {
                console.log(err);
                resolve([]);
            } else {
                resolve(rows.filter(r => r).map(r => { 
                    r.system_time = new Date(r.system_time + 'Z').getTime();
                    console.log(`got gnss auth for time ${r.system_time}`)
                    return r;
                }));
            }
        });
    });
}