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
