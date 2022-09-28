import { exec, ExecException } from 'child_process';
import { FRAMES_ROOT_FOLDER, getStopCameraCommand, GPS_LATEST_SAMPLE } from 'config';
import { readFile } from 'fs';
import { IService } from 'types';
import { setLockTime, setCameraTime, ifTimeSet } from 'util/lock';
// import { isPairing, repairNetworking } from 'util/network';
import { COLORS, updateLED } from '../util/led';

let previousCameraResponse = '';
let mostRecentPing = 0;
let isFirmwareUpdate = false;
let isPreviewInProgress = false;
let wasGpsGood = false;
let got3dOnce = false;

export const setMostRecentPing = (_mostRecentPing: number) => {
  mostRecentPing = _mostRecentPing;
};

export const switchToFirmwareUpdate = (state: boolean) => {
  isFirmwareUpdate = state;
};

export const setPreviewStatus = (state: boolean) => {
  isPreviewInProgress = state;
};

export const HeartBeatService: IService = {
  execute: async () => {
    try {
      if (isFirmwareUpdate) {
        updateLED(COLORS.PURPLE, COLORS.PURPLE, COLORS.PURPLE);
        return;
      }
      exec(
        `systemctl is-active camera-bridge && ls ${FRAMES_ROOT_FOLDER} | tail -1`,
        {
          encoding: 'utf-8',
        },
        (error: ExecException | null, stdout: string) => {
          const cameraResponse = error ? '' : stdout;

          let imgLED: any;
          if (isPreviewInProgress) {
            imgLED = COLORS.BLUE;
          } else {
            imgLED =
              cameraResponse.indexOf('active') === 0
                ? cameraResponse !== previousCameraResponse
                  ? previousCameraResponse
                    ? COLORS.GREEN
                    : COLORS.YELLOW
                  : COLORS.YELLOW
                : COLORS.RED;
          }

          previousCameraResponse = cameraResponse;

          let gpsLED = COLORS.RED;

          try {
            readFile(
              GPS_LATEST_SAMPLE,
              {
                encoding: 'utf-8',
              },
              (err: NodeJS.ErrnoException | null, data: string) => {
                let gpsSample: any = {};
                if (data && !err) {
                  gpsSample = JSON.parse(data) || {};
                } 
        
                if (gpsSample?.fix === '3d') {
                  gpsLED = COLORS.GREEN;
                  setLockTime();
                  setCameraTime();
                  if (!wasGpsGood) {
                    console.log('Got 3d Fix');
                  }
                  wasGpsGood = true;
                  got3dOnce = true;
                } else {
                  if (gpsSample?.fix === '2d') {
                    gpsLED = COLORS.YELLOW;
                  }
                  if (wasGpsGood) {
                    console.log('Lost 3d Fix');
                  }
                  wasGpsGood = false;
    
                  if (
                    cameraResponse.indexOf('active') === 0 &&
                    !ifTimeSet() &&
                    !got3dOnce &&
                    !isPreviewInProgress
                  ) {
                    exec(getStopCameraCommand());
                    console.log(
                      'Camera intentionally stopped cause Lock is not there yet',
                    );
                  }
                }
    
                const appDisconnectionPeriod = mostRecentPing
                  ? Math.abs(Date.now() - mostRecentPing)
                  : 30000;
    
                let appLED = COLORS.RED;
                if (appDisconnectionPeriod < 15000) {
                  appLED = COLORS.GREEN;
                } else {
                  appLED = COLORS.YELLOW;
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
