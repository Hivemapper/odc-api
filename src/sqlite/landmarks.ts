import { runAsync } from 'sqlite';
import { Landmark } from 'types/detections';

export const insertLandmark = async (landmark: Landmark, thumbnailPath: string): Promise<void> => {
  const insertSQL = `
    INSERT OR IGNORE INTO landmarks (class, lat, lon, dashcam_lat, dashcam_lon, alt, detections, vehicle_heading, thumbnail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`;
  try {
    await runAsync(insertSQL, [
      landmark.label,
      landmark.lat,
      landmark.lon,
      landmark.dashcam_lat,
      landmark.dashcam_lon,
      landmark.alt,
      landmark.detections.length,
      landmark.vehicle_heading,
      thumbnailPath,
    ]);
    console.log('Landmark inserted:', landmark);
  } catch (error) {
    console.error('Error while inserting landmark:', error);
  }
};
