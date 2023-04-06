import { API_VERSION } from 'config';
import { InstrumentationData } from 'types';
import { getSessionId, getCpuLoad, getTimeFromBoot } from 'util/index';

const VALID_DASHCAM_EVENTS = new Set([
  'DashcamLoaded',
  'DashcamReceivedFirstGpsLock',
  'DashcamFetchedFirstGpsFile',
  'DashcamFetchedFirstImages',
  'DashcamLost3dLock',
  'DashcamGot3dLock',
  'DashcamApiRepaired',
  'DashcamPreviewImage',
  'DashcamApiError',
  'DashcamPackedFrameKm',
  'DashcamFirmwareUploaded',
  'DashcamLog',
]);

export class InstrumentationClass {
  constructor() {}
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
          }`,
        );
      });
    } catch {
      //
    }
  }
}

export const Instrumentation = new InstrumentationClass();
