import { IImage } from 'types';
import { GnssRecord, ImuRecord, MagnetometerRecord } from 'types/sqlite';
import { fetchGnssLogsByTime } from './gnss';
import { fetchImuLogsByTime } from './imu';
import { getFramesFromFS } from 'util/frames';
import { insertFrames } from './frames';
import { runAsync } from 'sqlite';
import { Instrumentation, getGnssDopKpi } from 'util/instrumentation';
import { GnssDopKpi } from 'types/instrumentation';
import { sleep } from 'util/index';
import { fetchMagnetometerLogsByTime } from './magnetometer';

let accumulated = 0;
let accumDuration = 0;
let accumGnssFreq = 0;
let accumImuFreq = 0;
let accumImageFreq = 0;

export const querySensorData = async (
  since: number, until?: number
): Promise<{ gnss: GnssRecord[]; imu: ImuRecord[]; images: IImage[]; magnetometer: MagnetometerRecord[] }> => {
  try {
    const start = Date.now();
    console.log('Getting sensor data for: ', new Date(since));

    // Restricting the GNSS query to 2 min max, to prevent accidental overloads.
    // Note: if `until` argument is explicitly provided, we do not restrict it.
    if (until === undefined) {
      until = Math.min(start, since + 120 * 1000);
    }

    const gnss = (await fetchGnssLogsByTime(since, until)).filter(g => g);
    if (gnss.length) {
        const imuSince = gnss[0].system_time;
        const imuUntil = gnss[gnss.length - 1].system_time;
        const imu = await fetchImuLogsByTime(imuSince, imuUntil);
        await sleep(2000); // let frame buffer to fill up if needed
        const images = await getFramesFromFS(imuSince, imuUntil);
        const magnetometer = await fetchMagnetometerLogsByTime(imuSince, imuUntil);
        const duration = (imuUntil - imuSince) / 1000;
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
              took: Date.now() - start,
            }),
          });
          accumulated = 0;
          accumGnssFreq = 0;
          accumImuFreq = 0;
          accumImageFreq = 0;
          accumDuration = 0;
          try {
            const dopKpi: GnssDopKpi = getGnssDopKpi(gnss);
            Instrumentation.add({
              event: 'DashcamDop',
              size: gnss.length,
              message: JSON.stringify(dopKpi),
            });
          } catch (e: unknown) {
            console.log(e);
          }
        }
  
        console.log(
          `Sensor data queried: ${gnss.length} GNSS, ${imu.length} IMU, ${
            images.length
          } images. Took ${
            Date.now() - start
          } msecs, Since: ${imuSince}, Until: ${imuUntil}, Period: ${duration.toFixed(
            1,
          )} secs. Freq: GNSS ${GnssFreq.toFixed(1)}, IMU ${ImuFreq.toFixed(1)}, Images ${ImageFreq.toFixed(1)}`,
        );
      }
      if (images.length) {
        await insertFrames(images);
      }
      return { gnss, imu, images, magnetometer };
    } else {
      console.log('No valuable GNSS data fetched');
      return { gnss: [], imu: [], images: [], magnetometer: [] };
    }
  } catch (e: unknown) {
    console.log('Unknown sensor data fetch problem', e);
    return { gnss: [], imu: [], images: [], magnetometer: [] };
  }
};

export const resetDB = async () => {
  try {
    console.log('RESETTING DB');
    await runAsync('DELETE FROM framekms;');
    await runAsync('DELETE FROM packed_framekms;');
    await runAsync('DELETE FROM gnss;');
    await runAsync('DELETE FROM imu;');
    await runAsync('DELETE FROM frames;');
    await runAsync('DELETE FROM error_logs;');
    await runAsync('DELETE FROM gnss_auth;');
    // perform VACUUM to free up the space
    await runAsync('VACUUM;');
  } catch (error) {
    console.error('Error clearing tables:', error);
  }
};

export const resetFrameKmwithCutoff = async (cutoff: number) => {
  try {
    console.log('RESETTING FRAMEKMS WITH CUTOFF');
    await runAsync('DELETE FROM framekms WHERE system_time < ?;', [cutoff]);
    // perform VACUUM to free up the space
    await runAsync('VACUUM;');
  } catch (error) {
    console.error('Error clearing tables:', error);
  }
};

export const resetSensorData = async () => {
  try {
    console.log('RESETTING SENSOR DATA');
    await runAsync('DELETE FROM gnss;');
    await runAsync('DELETE FROM imu;');
    await runAsync('DELETE FROM gnss_auth;');
    await runAsync('DELETE FROM error_logs;');
    // perform VACUUM to free up the space
    await runAsync('VACUUM;');
  } catch (error) {
    console.error('Error clearing tables:', error);
  }
}