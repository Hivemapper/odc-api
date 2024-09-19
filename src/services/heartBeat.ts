import { exec, ExecException, spawnSync } from 'child_process';
import {
  CMD,
  FIRMWARE_UPDATE_MARKER,
  HEALTH_MARKER_PATH,
  isDev,
} from 'config';
import { existsSync } from 'fs';
import { IService } from 'types';
import { Instrumentation } from 'util/instrumentation';
import { isTimeSet, setGnssTime, setLockTime, setTime } from 'util/lock';
import { isEnoughLightForGnss } from 'util/gnss';
import { COLORS, updateLED } from '../util/led';
import {
  isCameraRunningOutOfSpace,
  setIsAppConnectionRequired,
} from './trackDownloadDebt';
import * as console from 'console';
import { isPrivateLocation } from 'util/privacy';
import { insertErrorLog } from 'sqlite/error';
import { getConfig } from 'sqlite/config';
import { fetchLastGnssRecord } from 'sqlite/gnss';
import { GnssRecord } from 'types/sqlite';

// let previousCameraResponse = '';
let mostRecentPing = 0;
let lastSuccessfulLock = 0;
let isFirmwareUpdate = false;
let isPreviewInProgress = false;
let wasCameraActive = false;
let isLock = false;
let inARow = 0;
let hasBeenLocked = false;
let lostLockOnce = false;
let isLedControlledByDashcam = true;
let lastGpsPoint: GnssRecord | null = null;
let lastTimeCheckWasPrivate = false;
let wasTimeResolved = false;
let isEndToEndTestingEnabled: boolean | undefined = undefined;

const DIM_GPS_LIGHT_DELAY = 20000;
const GOOD_GNSS_RECORDS_TO_START_CAMERA = 10;

export const setMostRecentPing = (_mostRecentPing: number) => {
  mostRecentPing = _mostRecentPing;
};

export const switchToFirmwareUpdate = (state: boolean) => {
  isFirmwareUpdate = state;
};

export const setPreviewStatus = (state: boolean) => {
  isPreviewInProgress = state;
};

export const getPreviewStatus = () => {
  return isPreviewInProgress;
};

export const setIsLedControlledByDashcam = (state: boolean) => {
  isLedControlledByDashcam = state;
};

export const isCameraBridgeServiceActive = async (): Promise<boolean> => {
  if (isEndToEndTestingEnabled) {
    return true;
  }

  try {
    const result = spawnSync('systemctl', ['is-active', 'camera-bridge'], {
      encoding: 'utf-8',
    });

    if (result.error) {
      console.log('failed to check if camera running:', result.error);
      return false;
    }
    const res = result.stdout.trim();
    return res === 'active';
  } catch (e) {
    console.log('failed to check if camera running:', e);
  }
  return false;
};

export const startCamera = () => {
  exec(CMD.START_CAMERA, (error: ExecException | null) => {
    if (!error) {
      console.log('Camera restarted');
    }
  });
};

export const restartCamera = () => {
  exec(CMD.RESTART_CAMERA, (error: ExecException | null) => {
    if (!error) {
      console.log('Camera restarted');
    }
  });
};

const createHealthMarker = () => {
  exec('touch ' + HEALTH_MARKER_PATH);
};

const isFirmwareUpdateInProcess = () => {
  return existsSync(FIRMWARE_UPDATE_MARKER);
};

const isGpsLock = (gpsSample: GnssRecord) => {
  const lock =
    gpsSample &&
    gpsSample.fix === '3D' &&
    Number(gpsSample.hdop) &&
    gpsSample.hdop < 5 &&
    (Number(gpsSample.eph) && gpsSample.eph < 15);
  return lock;
};

let blinking = false;

export const HeartBeatService: IService = {
  execute: async () => {
    try {
      createHealthMarker();

      if (isFirmwareUpdateInProcess()) {
        blinking = !blinking;
        if (blinking) {
          updateLED(COLORS.BLACK, COLORS.BLACK, COLORS.BLACK);
          return;
        }
      }
      if (isEndToEndTestingEnabled === undefined) {
        isEndToEndTestingEnabled = await getConfig('isEndToEndTestingEnabled');
      }

      const isCameraActive = await isCameraBridgeServiceActive();

      if (!isCameraActive && isTimeSet() && hasBeenLocked) {
        console.log('Starting the camera', new Date());
        restartCamera();
      }

      let gpsLED: any = null;
      try {
        const gpsSample = await fetchLastGnssRecord();
        if (gpsSample && isGpsLock(gpsSample)) {
          if (!isLock) {
            Instrumentation.add({
              event: 'DashcamGot3dLock',
            });
          }
          if (gpsSample.ttff) {
            setLockTime(gpsSample.ttff);
          }

          lastGpsPoint = { ...gpsSample };
          lastSuccessfulLock = Date.now();
          isLock = true;
          inARow++;

          if (inARow >= GOOD_GNSS_RECORDS_TO_START_CAMERA && !hasBeenLocked) {
            hasBeenLocked = true;
            Instrumentation.add({
              event: 'GpsLock',
              size: Number(gpsSample.ttff),
            });
            setTime();
          }
          if (hasBeenLocked && gpsSample.time) {
            setGnssTime(gpsSample.time);
          }
          if (!wasTimeResolved && gpsSample.time_resolved === 1) {
            wasTimeResolved = true;
            Instrumentation.add({
              event: 'DashcamTimeResolved',
            });
          }

          gpsLED = COLORS.GREEN;

        } else if (gpsSample) {
          const gpsLostPeriod = lastSuccessfulLock
            ? Math.abs(Date.now() - lastSuccessfulLock)
            : 70000;
          if (gpsLostPeriod > DIM_GPS_LIGHT_DELAY) {
            gpsLED = COLORS.DIM;
            if (isCameraActive && !lostLockOnce) {
              lostLockOnce = true;
              hasBeenLocked = false;
              exec(CMD.STOP_CAMERA);
              console.log(
                'Camera intentionally stopped cause Lock was lost once. Lets repair', Date.now()
              );
            }
          }

          inARow = 0;
          if (isLock) {
            Instrumentation.add({
              event: 'DashcamLost3dLock',
            });
            insertErrorLog('DashcamLost3dLock');
          }
          isLock = false;

          if (isCameraActive && (!hasBeenLocked || !isTimeSet()) && !isEndToEndTestingEnabled) {
            exec(CMD.STOP_CAMERA);
            console.log(
              'Camera intentionally stopped cause Lock is not there yet or Time is not set', Date.now()
            );
          }
        }

        const appLED = COLORS.GREEN;

        const appDisconnectionPeriod = mostRecentPing
          ? Math.abs(Date.now() - mostRecentPing)
          : 30000;

        if (appDisconnectionPeriod < 15000) {
          setIsAppConnectionRequired(false);
        }

        let cameraLED: any = null;
        if (isPreviewInProgress && isDev()) {
          cameraLED = COLORS.WHITE;
        } else {
          if (isCameraRunningOutOfSpace()) {
            cameraLED = COLORS.YELLOW;
            lastTimeCheckWasPrivate = false;
          } else {
            if (isCameraActive && gpsSample && isGpsLock(gpsSample)) {
              if (await isPrivateLocation(gpsSample.latitude, gpsSample.longitude)) {
                lastTimeCheckWasPrivate = true;
                cameraLED = COLORS.PINK;
              } else {
                lastTimeCheckWasPrivate = false;
                if (isTimeSet() && lastGpsPoint?.time_resolved) {
                  if (await isEnoughLightForGnss(lastGpsPoint)) {
                    cameraLED = COLORS.GREEN;
                  } else {
                    cameraLED = COLORS.DIM;
                  }
                } else {
                  cameraLED = COLORS.GREEN;
                }
              }
            } else {
              if (!lastTimeCheckWasPrivate && gpsSample) {
                cameraLED = isCameraActive ? COLORS.GREEN : COLORS.DIM;
              }
            }

            if (!isCameraActive && wasCameraActive) {
              console.log('CAMERA TURNED OFF!!!');
            }
          }
          wasCameraActive = isCameraActive;
        }

        if (isLedControlledByDashcam) {
          updateLED(cameraLED, gpsLED, appLED);
        }
      } catch (e: unknown) {
        console.log(e);
      }
    } catch (e: unknown) {
      console.log('LED service failed with error', e);
    }
  },
  interval: 1000,
};
