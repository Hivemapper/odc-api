import { Landmark, MergedLandmark } from 'types/motionModel';
import { getDb } from './index';


export const fetchLandmarksWithMapFeatureData = async (frameKmId: number): Promise<MergedLandmark[]> => {
    const query = `SELECT landmarks.*, map_features.lat as mf_lat, map_features.lon as mf_lon, map_features.alt as mf_alt, map_features.azimuth as mf_azimuth, map_features.width as mf_width, map_features.height as mf_height FROM landmarks JOIN map_features ON landmarks.map_feature_id = map_features.id WHERE landmarks.framekm_id = ?`;
    const args = [frameKmId];

    const db = await getDb();
    return new Promise((resolve) => {
        db.all(query, args, (err: unknown, rows: MergedLandmark[]) => {
            if (err) {
                console.log(err);
                resolve([]);
            } else {
                resolve(rows);
            }
        });
    });
}

export const checkIfLandmarksReady = async (frameKmId: number): Promise<boolean> => {
    // check if all landmarks related to framekm_id got map_feature_id assigned
    const query = `SELECT COUNT(*) as count FROM landmarks WHERE framekm_id = ? AND map_feature_id IS NULL`;
    const args = [frameKmId];
    const db = await getDb();
    return new Promise((resolve) => {
        db.get(query, args, (err: unknown, row: { count: number }) => {
            if (err) {
                console.log(err);
                resolve(false);
            } else {
                resolve(row.count === 0);
            }
        });
    });
}

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