import { db } from './index';

export const fetchGnssLogsByTime  = (from: number, to?: number): Promise<any[] | unknown> => {
    let query = `SELECT * FROM gnss WHERE time > ?`;
    const args = [from];

    if (to) {
        query += ` AND time < ?`;
        args.push(to);
    }
    return new Promise((resolve, reject) => {
        db.all(query, args, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

export const fetchGnssLogsById = (id: number): Promise<any[] | unknown> => {
    const query = `SELECT * FROM gnss WHERE id > ?`;
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

export const fetchLastNGnssRecords = async (n: number): Promise<any[] | unknown> => {
    const query = `SELECT * FROM gnss ORDER BY id DESC LIMIT ?`;
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