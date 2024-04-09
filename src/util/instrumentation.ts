import { API_VERSION, EVENTS_LOG_PATH } from 'config';
import { InstrumentationData } from 'types';
import { DopKpi, GnssDopKpi } from 'types/instrumentation';
import { Dilution } from 'types/motionModel';
import { getSessionId, getCpuLoad, getTimeFromBoot, ensureFileExists } from 'util/index';
import { promises } from 'fs';
import lockfile from 'proper-lockfile';
import { GnssRecord } from 'types/sqlite';

const VALID_DASHCAM_EVENTS = new Set([
  'DashcamLoaded',
  'DashcamReceivedFirstGpsLock',
  'DashcamFetchedFirstGpsFile',
  'DashcamFetchedFirstImages',
  'DashcamResolutionUpdated',
  'DashcamLost3dLock',
  'DashcamGot3dLock',
  'DashcamRejectedGps',
  'DashcamRepairedCursors',
  'DashcamRepairedGps',
  'DashcamSensorDataFreq',
  'DashcamCutReason',
  'DashcamMotionModelReport',
  'DashcamFailedPackingFrameKm',
  'DashcamShowedOutOfSpaceWarning',
  'DashcamShowedOldFilesWarning',
  'DashcamRemovedOldFiles',
  'DashcamNotMoving',
  'DashcamCommandExecuted',
  'DashcamDop',
  'DashcamFps',
  'DashcamML',
  'DashcamMLFailed',
  'DashcamImuFreq',
  'DashcamDbFileSize',
  'DashcamAppConnected',
  'DashcamApiRepaired',
  'DashcamPreviewImage',
  'DashcamApiError',
  'DashcamPackedFrameKm',
  'DashcamPackedPostProcessedFrameKm',
  'DashcamMLPostponed',
  'DashcamUnblocked',
  'DashcamFreeUpSpace',
  'DashcamDiskUsage',
  'DashcamInvalidFrameKm',
  'DashcamEmptyFrameKm',
  'DashcamReboot',
  'DashcamScheduledFrameKmToReprocess',
  'DashcamFirmwareUploaded',
  'DashcamFastSpeedCollection',
  'DashcamLog',
  'GpsLock',
  'DashcamUSBState',
]);

async function appendEventLog(event: string) {
    await ensureFileExists(EVENTS_LOG_PATH);
    // Random retries helps to not get into the same retry loop
    // It can mess up the order a bit, but if two events fired at the same time - we don't care for now
    const release = await lockfile.lock(EVENTS_LOG_PATH, { retries: [
      Math.random() * 100,
      Math.random() * 100,
      Math.random() * 100,
      Math.random() * 100,
      Math.random() * 100,
    ] });

    try {
        await promises.appendFile(EVENTS_LOG_PATH, '[INFO]' + event + '\r\n');
    } finally {
        await release();
    }
}

export class InstrumentationClass {
  private isHotLoad: boolean;
  constructor() {
    this.isHotLoad = false;
  }
  public add(record: InstrumentationData) {
    if (!VALID_DASHCAM_EVENTS.has(record.event)) {
      console.log('Invalid event name: ' + record.event);
      return;
    }
    try {
      getCpuLoad((cpuLoad: number) => {
        const event = 
          `|${Date.now()}|${API_VERSION}|${getSessionId()}|${
            record.event
          }|${getTimeFromBoot()}|${record.size || 0}|${cpuLoad}|${
            record.message || ''
          }|${this.isHotLoad ? 1 : 0}`;
        console.info(event);
        appendEventLog(event);
      });
    } catch {
      //
    }
  }
  public setHotLoad(_isHotLoad: boolean) {
    this.isHotLoad = _isHotLoad;
  }
}

export const Instrumentation = new InstrumentationClass();

export const getGnssDopKpi = (gnssArray: GnssRecord[]): GnssDopKpi => {
  const dopKpi: DopKpi = {
    min: 99,
    max: 99,
    mean: 99,
    median: 99,
    sum: 99,
    count: 0,
  };
  const ephKpi: DopKpi = {
    min: 999,
    max: 999,
    mean: 999,
    median: 999,
    sum: 999,
    count: 0,
  };
  const gnssKpi: GnssDopKpi = {
    xdop: { ...dopKpi },
    ydop: { ...dopKpi },
    pdop: { ...dopKpi },
    hdop: { ...dopKpi },
    vdop: { ...dopKpi },
    tdop: { ...dopKpi },
    gdop: { ...dopKpi },
    rf_jam_ind: { ...dopKpi },
    eph: { ...ephKpi },
  };

  const getMedian = (arr: number[]) => {
    // CAREFUL: ASSUMPTION THAT ARRAY IS SORTED ALREADY
    const midpoint = Math.floor(arr.length / 2); // 2.
    const median =
      arr.length % 2 === 1
        ? arr[midpoint]
        : (arr[midpoint - 1] + arr[midpoint]) / 2;
    return median;
  };

  try {
    if (gnssArray.length) {
      const dopKeys = [
        'xdop',
        'ydop',
        'pdop',
        'hdop',
        'vdop',
        'tdop',
        'gdop',
        'rf_jam_ind',
        'eph',
      ];
      for (const key of dopKeys) {
        let dop = [];
        if (key !== 'eph') {
          dop = gnssArray.map(d => d?.[key as keyof Dilution] || 99);
        } else {
          dop = gnssArray.map(g => g?.eph || 999);
        }
        if (dop.length) {
          dop = dop.sort((a: number, b: number) => a - b);
          const min = dop[0];
          const max = dop[dop.length - 1];
          const median = getMedian(dop);
          const sum = dop.reduce((a, b) => a + b, 0);
          const count = dop.length;

          gnssKpi[key as keyof GnssDopKpi] = {
            min,
            max,
            median,
            sum: Number(Number(sum).toFixed(2)),
            count,
            mean: Number(Number(sum / count).toFixed(2))
          };
        }
      }
    }
  } catch (e: unknown) {
    console.log('Error parsing DOP data');
  }
  return gnssKpi;
};

// json=$(du -b /data/recording | awk 'NR>1{printf(",")} {printf "\"%s\":%s", $2, $1}' | tr -d '\n') && echo "[21.07.2023 19:05.30.733] [INFO]|1695755621293|3.1.1|oBOaOazSm|DashcamLog|3061631|234|0|{$json}|1" >> /var/log/odc-api.log
