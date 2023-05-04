import { API_VERSION } from 'config';
import { InstrumentationData } from 'types';
import { DopKpi, GnssDopKpi } from 'types/instrumentation';
import { Dilution, GNSS } from 'types/motionModel';
import { getSessionId, getCpuLoad, getTimeFromBoot } from 'util/index';

const VALID_DASHCAM_EVENTS = new Set([
  'DashcamLoaded',
  'DashcamReceivedFirstGpsLock',
  'DashcamFetchedFirstGpsFile',
  'DashcamFetchedFirstImages',
  'DashcamResolutionUpdated',
  'DashcamLost3dLock',
  'DashcamGot3dLock',
  'DashcamRejectedGps',
  'DashcamMotionModelReport',
  'DashcamDop',
  'DashcamFps',
  'DashcamImuFreq',
  'DashcamAppConnected',
  'DashcamApiRepaired',
  'DashcamPreviewImage',
  'DashcamApiError',
  'DashcamPackedFrameKm',
  'DashcamFirmwareUploaded',
  'DashcamLog',
]);

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
        console.info(
          `|${Date.now()}|${API_VERSION}|${getSessionId()}|${
            record.event
          }|${getTimeFromBoot()}|${record.size || 0}|${cpuLoad}|${
            record.message || ''
          }|${this.isHotLoad ? 1 : 0}`,
        );
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

export const getGnssDopKpi = (
  gnssArray: GNSS[],
  validRecords: GNSS[],
): GnssDopKpi => {
  const dopKpi: DopKpi = {
    min: 99,
    max: 99,
    mean: 99,
    median: 99,
    sum: 99,
    count: 0,
    filtered: 0,
  };
  const gnssKpi: GnssDopKpi = {
    xdop: { ...dopKpi },
    ydop: { ...dopKpi },
    pdop: { ...dopKpi },
    hdop: { ...dopKpi },
    vdop: { ...dopKpi },
    tdop: { ...dopKpi },
    gdop: { ...dopKpi },
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
      const dopArray = gnssArray.map(gnss => gnss.dop);
      const dopKeys = ['xdop', 'ydop', 'pdop', 'hdop', 'vdop', 'tdop', 'gdop'];
      for (const key of dopKeys) {
        let dop = dopArray.map(d => d?.[key as keyof Dilution] || 99);
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
            mean: Number(Number(sum / count).toFixed(2)),
            filtered: validRecords.length,
          };
        }
      }
    }
  } catch (e: unknown) {
    console.log('Error parsing DOP data');
  }
  return gnssKpi;
};
