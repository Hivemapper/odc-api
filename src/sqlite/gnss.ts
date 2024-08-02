import { GnssRecord } from 'types/sqlite';
import { getDb, queryDB } from './index';
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
                }).filter(r => r.time > DEFAULT_TIME));
            }
        });
    });
}

export const fetchGnssLogsById = async (id: number): Promise<GnssRecord[]> => {
    const query = `SELECT * FROM gnss WHERE id > ?`;
    return queryDB<GnssRecord>(query, [id]);
}

export const fetchLastNGnssRecords = async (n: number): Promise<GnssRecord[]> => {
    const query = `SELECT * FROM gnss ORDER BY id DESC LIMIT ?`;
    return queryDB<GnssRecord>(query, [n]);
}

export const fetchLastGnssRecord = async (): Promise<GnssRecord | null> => {
    try {
        const lastRecords = await fetchLastNGnssRecords(1);
        if (lastRecords.length) {
            const last = lastRecords[0];
            last.time = new Date(last.time + 'Z').getTime();
            return last;
        } else {
            return null;
        }
    } catch (e) {
        console.log(e);
        return null;
    }
}

export const fetchProcessedGnssLogsByTime  = async (from: number, to?: number): Promise<GnssRecord[]> => {
    let query = `SELECT * FROM gnss_processed WHERE time > ?`;
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
                }).filter(r => r.time > DEFAULT_TIME));
            }
        });
    });
}

export const fetchProcessedGnssLogsById = async (id: number): Promise<GnssRecord[]> => {
    const query = `SELECT * FROM gnss_processed WHERE id > ?`;
    return queryDB<GnssRecord>(query, [id]);
}

export const fetchLastNProcessedGnssRecords = async (n: number): Promise<GnssRecord[]> => {
    const query = `SELECT * FROM gnss_processed ORDER BY id DESC LIMIT ?`;
    return queryDB<GnssRecord>(query, [n]);
}

export const fetchLastProcessedGnssRecord = async (): Promise<GnssRecord | null> => {
    try {
        const lastRecords = await fetchLastNProcessedGnssRecords(1);
        if (lastRecords.length) {
            const last = lastRecords[0];
            last.time = new Date(last.time + 'Z').getTime();
            return last;
        } else {
            return null;
        }
    } catch (e) {
        console.log(e);
        return null;
    }
}