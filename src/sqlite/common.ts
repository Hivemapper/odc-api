import { IImage } from 'types';
import { GnssRecord, ImuRecord } from 'types/sqlite';
import { fetchGnssLogsByTime } from './gnss';
import { fetchImuLogsByTime } from './imu';
import { getFramesFromFS } from 'util/frames';
import { insertFrames } from './frames';
import { db, runAsync } from 'sqlite';

export const querySensorData = async (
  lastTimestamp: number,
): Promise<{ gnss: GnssRecord[]; imu: ImuRecord[]; images: IImage[] }> => {
  try {
    const logTime = Math.max(lastTimestamp, Date.now() - 60 * 1000);
    console.log('Getting sensor data for: ', new Date(logTime));
    const start = Date.now();
    const gnss = (await fetchGnssLogsByTime(logTime)).filter(g => g); // don't fetch more than a minute of data
    const since = gnss[0].system_time;
    const until = gnss[gnss.length - 1].system_time;

    const imu = await fetchImuLogsByTime(since, until);
    const images = await getFramesFromFS(since, until);
    const duration = (until - since) / 1000;
    console.log(
      `Sensor data queried: ${gnss.length} GNSS, ${imu.length} IMU, ${
        images.length
      } images. Took ${
        Date.now() - start
      } msecs, Since: ${since}, Until: ${until}, Period: ${duration.toFixed(
        1,
      )} secs. ${
        duration > 0
          ? `Freq: GNSS ${(gnss.length / duration).toFixed(1)}, IMU ${(
              imu.length / duration
            ).toFixed(1)}, Images ${(images.length / duration).toFixed(1)}, `
          : ''
      }`,
    );
    if (images.length) {
      await insertFrames(images);
    }
    return { gnss, imu, images };
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
  } catch (error) {
    console.error('Error clearing tables:', error);
  }
};