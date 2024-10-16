import { Landmark } from 'types/motionModel';
import { getDb } from './index';

export const fetchLandmarksByFrameKmId  = async (frameKmId: number): Promise<Landmark[]> => {
    const query = `SELECT * FROM landmarks WHERE framekm_id = ?`;
    const args = [frameKmId];

    const db = await getDb();
    return new Promise((resolve) => {
        db.all(query, args, (err: unknown, rows: Landmark[]) => {
            if (err) {
                console.log(err);
                resolve([]);
            } else {
                resolve(rows);
            }
        });
    });
}