import { exec, ExecException, execSync, spawnSync } from 'child_process';
import {
  CAMERA_TYPE,
  CMD,
  GPS_LATEST_SAMPLE,
  HEALTH_MARKER_PATH,
  isDev,
} from 'config';
import { readFileSync } from 'fs';
import { jsonrepair } from 'jsonrepair';
import { CameraType, IService } from 'types';
import { GNSS } from 'types/motionModel';
import { Instrumentation } from 'util/instrumentation';
import { setLockTime, setSystemTime } from 'util/lock';
import { isEnoughLightForGnss } from 'util/motionModel';
import { COLORS, updateLED } from '../util/led';
import {
  isCameraRunningOutOfSpace,
  setIsAppConnectionRequired,
} from './trackDownloadDebt';
import * as console from 'console';

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

export const isCameraBridgeServiceActive = (): boolean => {
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

const fetchGNSSLatestSample = () => {
  let gpsSample: any = null;

  try {
    const data = readFileSync(GPS_LATEST_SAMPLE, {
      encoding: 'utf-8',
    });
    try {
      gpsSample = JSON.parse(jsonrepair(data));
    } catch (e) {
      console.log('Latest.log Parse Error:', e);
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

const isGpsLock = (gpsSample: any) => {
  const lock =
    gpsSample &&
    gpsSample.fix === '3D' &&
    gpsSample.dop &&
    Number(gpsSample.dop.hdop) &&
    gpsSample.dop.hdop < 5 &&
    ((Number(gpsSample.eph) && gpsSample.eph < 30) ||
      CAMERA_TYPE === CameraType.HdcS);
  return lock;
};

export const HeartBeatService: IService = {
  execute: async () => {
    try {
      createHealthMarker();

      if (isFirmwareUpdate && isLedControlledByDashcam) {
        updateLED(COLORS.WHITE, COLORS.WHITE, COLORS.WHITE);
        return;
      }

      const isCameraActive = isCameraBridgeServiceActive();

      let gpsLED: any = null;
      try {
        const gpsSample = fetchGNSSLatestSample();
        if (isGpsLock(gpsSample)) {
          if (!hasBeenLockOnce) {
            Instrumentation.add({
              event: 'GpsLock',
              size: Number(gpsSample.ttff),
            });
            if (CAMERA_TYPE === CameraType.HdcS) {
              // TODO: It's here only cause the system clock is not yet implemented on Hdc-S. Urgently remove once done
              setSystemTime(
                new Date(gpsSample.timestamp || '').getTime(),
                () => {
                  restartCamera();
                },
              );
            }
          } else if (!isLock) {
            Instrumentation.add({
              event: 'DashcamGot3dLock',
            });
          }
          if (gpsSample.ttff) {
            setLockTime(gpsSample.ttff);
          }

          lastGpsPoint = gpsSample;
          lastSuccessfulLock = Date.now();
          isLock = true;
          hasBeenLockOnce = true;

          gpsLED = COLORS.GREEN;
          if (!isCameraActive) {
            startCamera();
          }
        } else {
          const gpsLostPeriod = lastSuccessfulLock
            ? Math.abs(Date.now() - lastSuccessfulLock)
            : 70000;
          if (gpsLostPeriod > 12000) {
            gpsLED = COLORS.RED;
          }

          if (isLock) {
            Instrumentation.add({
              event: 'DashcamLost3dLock',
            });
          }
          isLock = false;

          if (isCameraActive && !hasBeenLockOnce) {
            exec(CMD.STOP_CAMERA);
            console.log(
              'Camera intentionally stopped cause Lock is not there yet',
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
          } else {
            cameraLED =
              isCameraActive &&
              lastGpsPoint &&
              isEnoughLightForGnss(lastGpsPoint)
                ? COLORS.GREEN
                : COLORS.RED;
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
  interval: 3000,
};
