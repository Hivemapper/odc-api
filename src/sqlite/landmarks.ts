import { runAsync } from 'sqlite';
import { Landmark } from 'types/detections';

export const insertLandmark = async (landmark: Landmark, thumbnailPath: string): Promise<void> => {
  const insertSQL = `
    INSERT OR REPLACE INTO landmarks (class, lat, lon, detections, thumbnail)
    VALUES (?, ?, ?, ?, ?);`;
  try {
    await runAsync(insertSQL, [
      landmark.label,
      landmark.lat,
      landmark.lon,
      landmark.detections.length,
      thumbnailPath,
    ]);
    console.log('Landmark inserted:', landmark);
  } catch (error) {
    console.error('Error while inserting landmark:', error);
  }
};
