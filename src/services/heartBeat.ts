import { exec, ExecException } from 'child_process';
import { CMD, GPS_LATEST_SAMPLE, isDev } from 'config';
import { readFile } from 'fs';
import { IService } from 'types';
import { setLockTime, setCameraTime, ifTimeSet } from 'util/lock';
import { COLORS, updateLED } from '../util/led';

// let previousCameraResponse = '';
let mostRecentPing = 0;
let lastSuccessfulFix = 0;
let isFirmwareUpdate = false;
let isPreviewInProgress = false;
let wasCameraActive = false;
let wasGpsGood = false;

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

export const HeartBeatService: IService = {
  execute: async () => {
    try {
      if (isFirmwareUpdate) {
        updateLED(COLORS.PURPLE, COLORS.PURPLE, COLORS.PURPLE);
        return;
      }
      // systemctl is-active camera-bridge && ls ${FRAMES_ROOT_FOLDER} | tail -1
      exec(
        `systemctl is-active camera-bridge`,
        {
          encoding: 'utf-8',
        },
        (error: ExecException | null, stdout: string) => {
          const cameraResponse = error ? '' : stdout;

          let imgLED: any;
          if (isPreviewInProgress && isDev()) {
            imgLED = COLORS.WHITE;
          } else {
            const isCameraActive = cameraResponse.indexOf('active') === 0;
            imgLED = isCameraActive ? COLORS.GREEN : COLORS.RED;

            if (!isCameraActive && wasCameraActive) {
              console.log('CAMERA TURNED OFF!!!');
            }
            wasCameraActive = isCameraActive;
          }

          // previousCameraResponse = cameraResponse;

          let gpsLED = COLORS.GREEN;
          try {
            readFile(
              GPS_LATEST_SAMPLE,
              {
                encoding: 'utf-8',
              },
              (err: NodeJS.ErrnoException | null, data: string) => {
                let gpsSample: any = {};
                if (data) {
                  try {
                    gpsSample = JSON.parse(data) || {};
                  } catch (e: unknown) {
                    console.log('Latest.log Parse Error:', e);
                  }
                }

                if (gpsSample && gpsSample.fix === '3D') {
                  gpsLED = COLORS.GREEN;
                  lastSuccessfulFix = Date.now();
                  setLockTime();
                  setCameraTime();
                  if (!wasGpsGood) {
                    console.log('Got 3d Fix');
                  }
                  wasGpsGood = true;
                } else {
                  const gpsLostPeriod = lastSuccessfulFix
                    ? Math.abs(Date.now() - lastSuccessfulFix)
                    : 70000;
                  if (gpsLostPeriod > 60000) {
                    gpsLED = COLORS.RED;
                  }

                  if (wasGpsGood) {
                    console.log('Lost 3d Fix');
                  }
                  wasGpsGood = false;
                }

                const appDisconnectionPeriod = mostRecentPing
                  ? Math.abs(Date.now() - mostRecentPing)
                  : 30000;

                let appLED = COLORS.RED;
                if (appDisconnectionPeriod < 15000) {
                  appLED = COLORS.GREEN;
                }
                updateLED(imgLED, gpsLED, appLED);
              },
            );
          } catch (e: unknown) {
            console.log(e);
          }
        },
      );
    } catch (e: unknown) {
      console.log('LED service failed with error', e);
    }
  },
  interval: 7000,
};
