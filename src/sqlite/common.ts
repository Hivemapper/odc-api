import { IImage } from 'types';
import { GnssRecord, ImuRecord } from 'types/sqlite';
import { fetchGnssLogsByTime } from './gnss';
import { fetchImuLogsByTime } from './imu';
import { getFramesFromFS } from 'util/frames';
import { insertFrames } from './frames';
import { db, runAsync } from 'sqlite';
import { Instrumentation } from 'util/instrumentation';

let accumulated = 0;
let accumDuration = 0;
let accumGnssFreq = 0;
let accumImuFreq = 0;
let accumImageFreq = 0;

export const querySensorData = async (
  lastTimestamp: number,
): Promise<{ gnss: GnssRecord[]; imu: ImuRecord[]; images: IImage[] }> => {
  try {
    const gnssSince = Math.max(lastTimestamp, Date.now() - 60 * 1000);
    console.log('Getting sensor data for: ', new Date(gnssSince));
    const start = Date.now();
    const gnssUntil = gnssSince + 120 * 1000; // restricting the GNSS query to 2 min max, to prevent accidental overloads
    const gnss = (await fetchGnssLogsByTime(gnssSince, gnssUntil)).filter(g => g); // don't fetch more than a minute of data
    if (gnss.length) {
      const since = gnss[0].system_time;
      const until = Math.min(gnss[gnss.length - 1].system_time, since + 120 * 1000);  // restricting the IMU query to 2 min max, to prevent accidental overloads
  
      const imu = await fetchImuLogsByTime(since, until);
      const images = await getFramesFromFS(since, until);
      const duration = (until - since) / 1000;
      if (duration > 0) {
        const GnssFreq = gnss.length / duration;
        const ImuFreq = imu.length / duration;
        const ImageFreq = images.length / duration;
  
        accumulated++;
        accumDuration += duration;
        accumGnssFreq += GnssFreq;
        accumImuFreq += ImuFreq;
        accumImageFreq += ImageFreq;
  
        if (accumulated >= 10) {
          Instrumentation.add({
            event: 'DashcamSensorDataFreq',
            size: Math.round(accumDuration),
            message: JSON.stringify({
              fps: Math.round(accumImageFreq / accumulated),
              imu: Math.round(accumImuFreq / accumulated),
              gnss: Math.round(accumGnssFreq / accumulated),
            }),
          });
          accumulated = 0;
          accumGnssFreq = 0;
          accumImuFreq = 0;
          accumImageFreq = 0;
          accumDuration = 0;
        }
  
        console.log(
          `Sensor data queried: ${gnss.length} GNSS, ${imu.length} IMU, ${
            images.length
          } images. Took ${
            Date.now() - start
          } msecs, Since: ${since}, Until: ${until}, Period: ${duration.toFixed(
            1,
          )} secs. Freq: GNSS ${GnssFreq.toFixed(1)}, IMU ${ImuFreq.toFixed(1)}, Images ${ImageFreq.toFixed(1)}`,
        );
      }
      if (images.length) {
        await insertFrames(images);
      }
      return { gnss, imu, images };
    } else {
      console.log('No valuable GNSS data fetched');
      return { gnss: [], imu: [], images: [] };
    }
  } catch (e: unknown) {
    console.log('Unknown sensor data fetch problem', e);
    return { gnss: [], imu: [], images: [] };
  }
};

export const resetDB = async () => {
  try {
    console.log('RESETTING DB');
    await runAsync(db, 'DELETE FROM framekms;');
    await runAsync(db, 'DELETE FROM gnss;');
    await runAsync(db, 'DELETE FROM imu;');
    await runAsync(db, 'DELETE FROM frames;');
    await runAsync(db, 'DELETE FROM error_logs;');
  } catch (error) {
    console.error('Error clearing tables:', error);
  }
};