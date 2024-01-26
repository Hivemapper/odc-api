import { exec, ExecException, spawnSync } from 'child_process';
import {
  CMD,
  FIRMWARE_UPDATE_MARKER,
  GPS_LATEST_SAMPLE,
  HEALTH_MARKER_PATH,
  isDev,
} from 'config';
import { existsSync, readFileSync } from 'fs';
import { jsonrepair } from 'jsonrepair';
import { IService } from 'types';
import { GNSS } from 'types/motionModel';
import { Instrumentation } from 'util/instrumentation';
import { isTimeSet, setLockTime } from 'util/lock';
import { isEnoughLightForGnss } from 'util/gnss';
import { COLORS, updateLED } from '../util/led';
import {
  isCameraRunningOutOfSpace,
  setIsAppConnectionRequired,
} from './trackDownloadDebt';
import * as console from 'console';
import { isPrivateLocation } from 'util/privacy';
import { fileExists } from 'util/index';
import { insertErrorLog } from 'sqlite/error';

// let previousCameraResponse = '';
let mostRecentPing = 0;
let lastSuccessfulLock = 0;
let isFirmwareUpdate = false;
let isPreviewInProgress = false;
let wasCameraActive = false;
let isLock = false;
let hasBeenLockOnce = false;
let isLedControlledByDashcam = true;
let lastGpsPoint: GNSS | null = null;
let lastTimeCheckWasPrivate = false;

const DIM_GPS_LIGHT_DELAY = 20000;

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

const fetchGNSSLatestSample = async () => {
  let gpsSample: any = null;

  try {
    const exists = await fileExists(GPS_LATEST_SAMPLE);
    if (exists) {
      const data = readFileSync(GPS_LATEST_SAMPLE, {
        encoding: 'utf-8',
      });
      try {
        gpsSample = JSON.parse(jsonrepair(data));
      } catch (e) {
        // console.log('Latest.log Parse Error:', e);
      }
    }
  } catch (e) {
    console.log('failed to read ', GPS_LATEST_SAMPLE);
  }
  return gpsSample;
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

const isGpsLock = (gpsSample: any) => {
  const lock =
    gpsSample &&
    gpsSample.fix === '3D' &&
    gpsSample.dop &&
    Number(gpsSample.dop.hdop) &&
    gpsSample.dop.hdop < 6 &&
    (Number(gpsSample.eph) && gpsSample.eph < 25);
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

      const isCameraActive = await isCameraBridgeServiceActive();

      if (!isCameraActive && isTimeSet() && hasBeenLockOnce) {
        console.log('Starting the camera', new Date());
        startCamera();
      }

      let gpsLED: any = null;
      try {
        const gpsSample = await fetchGNSSLatestSample();
        if (isGpsLock(gpsSample)) {
          if (!hasBeenLockOnce ) {
            Instrumentation.add({
              event: 'GpsLock',
              size: Number(gpsSample.ttff),
            });
          } else if (!isLock) {
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
          hasBeenLockOnce = true;

          gpsLED = COLORS.GREEN;

        } else if (gpsSample) {
          const gpsLostPeriod = lastSuccessfulLock
            ? Math.abs(Date.now() - lastSuccessfulLock)
            : 70000;
          if (gpsLostPeriod > DIM_GPS_LIGHT_DELAY) {
            gpsLED = COLORS.DIM;
          }

          if (isLock) {
            Instrumentation.add({
              event: 'DashcamLost3dLock',
            });
            insertErrorLog('DashcamLost3dLock');
          }
          isLock = false;

          if (isCameraActive && (!hasBeenLockOnce || !isTimeSet())) {
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
              if (isPrivateLocation(gpsSample.latitude, gpsSample.longitude)) {
                lastTimeCheckWasPrivate = true;
                cameraLED = COLORS.PINK;
              } else {
                lastTimeCheckWasPrivate = false;
                if (isTimeSet() && lastGpsPoint?.timestamp) {
                  if (isEnoughLightForGnss(lastGpsPoint)) {
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
