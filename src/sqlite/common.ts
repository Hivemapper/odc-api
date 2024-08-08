import { IImage } from 'types';
import { GnssRecord, ImuRecord, MagnetometerRecord } from 'types/sqlite';
import { fetchProcessedGnssLogsByTime } from './gnss';
import { fetchProcessedImuLogsByTime } from './imu';
import { getFramesFromFS } from 'util/frames';
import { insertFrames } from './frames';
import { runAsync } from 'sqlite';
import { insertSensorFusionLog  } from 'sqlite/error';
import { Instrumentation, getGnssDopKpi } from 'util/instrumentation';
import { GnssDopKpi } from 'types/instrumentation';
import { sleep } from 'util/index';
import { fetchMagnetometerLogsByTime } from './magnetometer';
import { writeFile } from 'fs';
import { getLatestGnssTime } from 'util/lock';

let accumulated = 0;
let accumDuration = 0;
let accumGnssFreq = 0;
let accumImuFreq = 0;
let accumImageFreq = 0;
let biggestGnssSystemTimeDelta = 0;
let biggestGnssTimeDelta = 0;
let biggestTimeFixDelta = 0;

export const querySensorData = async (
  since: number, until?: number, ignoreMagnetometer?: boolean, requester?: string,
): Promise<{ gnss: GnssRecord[]; imu: ImuRecord[]; images: IImage[]; magnetometer: MagnetometerRecord[] }> => {
  try {
    if (!since) {
      return { gnss: [], imu: [], images: [], magnetometer: [] };
    }
    const start = Date.now();
    console.log(requester,'-> Getting sensor data for: ', new Date(since));

    // Restricting the GNSS query to 2 min max, to prevent accidental overloads.
    // Note: if `until` argument is explicitly provided, we do not restrict it.
    if (until === undefined) {
      until = since + 120 * 1000;
    }

    try{
      await insertSensorFusionLog('querySensorData', `Querying sensor data from ${(new Date(since)).toISOString()} to ${(new Date(until)).toISOString()}`);
    }
    catch(e){
      console.log('Query Sensor Data-> Error inserting into sensor_fusion_logs:', e);
    }

    const gnss = (await fetchProcessedGnssLogsByTime(since, until)).filter(g => g);
    if (gnss.length) {
        const imuSince = gnss[0].system_time;
        const imuUntil = gnss[gnss.length - 1].system_time;
        const session = gnss[0].session;
        const imu = await fetchProcessedImuLogsByTime(imuSince, imuUntil, session); 
        await sleep(2000); // let frame buffer to fill up if needed
        const images = await getFramesFromFS(imuSince, imuUntil);
        let magnetometer: MagnetometerRecord[] = [];
        if (!ignoreMagnetometer) {
          magnetometer = await fetchMagnetometerLogsByTime(imuSince, imuUntil, session);
        }
        const duration = (imuUntil - imuSince) / 1000;
      if (duration > 0) {
        const GnssFreq = gnss.length / duration;
        const ImuFreq = imu.length / duration;
        const ImageFreq = images.length / duration;
        const gnssSystemTimeDelta = gnss.reduce((maxDelta, current, index, array) => {
          if (index === 0) return maxDelta; // Skip the first element to avoid out of bounds
          const delta = current.system_time - array[index - 1].system_time;
          return delta > maxDelta ? delta : maxDelta;
        }, 0);
        const gnssTimeDelta = gnss.reduce((maxDelta, current, index, array) => {
          if (index === 0) return maxDelta; // Skip the first element to avoid out of bounds
          const delta = current.time - array[index - 1].time;
          return delta > maxDelta ? delta : maxDelta;
        }, 0);
        const gnssSystemTimeFixDelta = gnss.reduce((maxDelta, current, index, array) => {
          const delta = Math.abs(current.system_time - current.actual_system_time);
          return delta > maxDelta ? delta : maxDelta;
        }, 0);
        // console.log('==========GNSS DELTA ===============');
        // console.log(gnssSystemTimeDelta);
        // console.log(gnssTimeDelta);
        // console.log('=====================================');
        // if (gnssSystemTimeDelta > 1000 || gnssTimeDelta > 1000) {
        //   // store json for investigation
        //   const filename = `/mnt/data/gnssDelta_${Date.now()}_${gnssSystemTimeDelta}_${gnssTimeDelta}.json`; // Create a filename with a timestamp
        //   const dataToSave = JSON.stringify(gnss, null, 2); // Convert the GNSS data array to a formatted JSON string

        //   writeFile(filename, dataToSave, 'utf8', (err) => {
        //       if (err) {
        //           console.log('Error writing file:', err);
        //       } else {
        //           console.log(`Data saved to ${filename} for investigation.`);
        //       }
        //   });
        // }
        if (gnssSystemTimeDelta > biggestGnssSystemTimeDelta) {
          biggestGnssSystemTimeDelta = gnssSystemTimeDelta;
        }
        if (gnssTimeDelta > biggestGnssTimeDelta) {
          biggestGnssTimeDelta = gnssTimeDelta;
        }
        if (gnssSystemTimeFixDelta > biggestTimeFixDelta) {
          biggestTimeFixDelta = gnssSystemTimeFixDelta;
        }
  
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
              biggestGnssSystemTimeDelta,
              biggestGnssTimeDelta,
              biggestTimeFixDelta,
            }),
          });
          accumulated = 0;
          accumGnssFreq = 0;
          accumImuFreq = 0;
          accumImageFreq = 0;
          accumDuration = 0;
          biggestGnssSystemTimeDelta = 0;
          biggestGnssTimeDelta = 0;
          biggestTimeFixDelta = 0;
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