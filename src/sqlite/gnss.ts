import { GnssRecord } from 'types/sqlite';
import { getDb } from './index';
import { convertTimestampToDbFormat } from 'util/index';
import { DEFAULT_TIME } from 'util/lock';
import { getConfig } from './config';

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

export const fetchNGnssRecords = async (n: number, order = 'DESC'): Promise<GnssRecord[]> => {
    const query = `SELECT * FROM gnss ORDER BY id ${order} LIMIT ?`;
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

const GNSS_HEADING_ACCURACY_THRESHOLD = 3.0;
export const fetchGnssWithCleanHeading = async (from: number, to?: number): Promise<{ heading: number | null, time: number }[]> => {
    // Fetch GNSS logs within the time range
    const gnssRecords = await fetchGnssLogsByTime(from, to);

    const dataLength = gnssRecords.length;
    const forwardLoop: (number | null)[] = new Array(dataLength).fill(null);
    const backwardLoop: (number | null)[] = new Array(dataLength).fill(null);

    let lastForwardGood: number | null = null;
    let lastBackwardGood: number | null = null;

    // Forward direction scan
    for (let i = 0; i < dataLength; i++) {
        if (gnssRecords[i].heading_accuracy < GNSS_HEADING_ACCURACY_THRESHOLD) {
            lastForwardGood = gnssRecords[i].heading;
        }
        forwardLoop[i] = lastForwardGood;
    }

    // Backward direction scan
    for (let i = dataLength - 1; i >= 0; i--) {
        if (gnssRecords[i].heading_accuracy < GNSS_HEADING_ACCURACY_THRESHOLD) {
            lastBackwardGood = gnssRecords[i].heading;
        }
        backwardLoop[i] = lastBackwardGood;
    }

    return gnssRecords.map((record, index) => ({
        heading: forwardLoop[index] !== null ? forwardLoop[index] : backwardLoop[index],
        time: record.system_time
    }));
}

export const fetchLastGnssRecord = async (): Promise<GnssRecord | null> => {
    try {
        const isEndToEndTestingEnabled = await getConfig('isEndToEndTestingEnabled');
        const lastRecords = await fetchNGnssRecords(1, isEndToEndTestingEnabled ? 'ASC' : 'DESC');
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