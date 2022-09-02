import { exec, ExecException } from 'child_process';
import { FRAMES_ROOT_FOLDER, NETWORK_CONFIG_PATH } from 'config';
import { readFile } from 'fs';
import { IService } from 'types';
import { setLockTime } from 'util/lock';
import { isPairing, repairNetworking } from 'util/network';
import { COLORS, updateLED } from '../util/led';

let previousCameraResponse = '';
let mostRecentPing = 0;
let isFirmwareUpdate = false;

export const setMostRecentPing = (_mostRecentPing: number) => {
  mostRecentPing = _mostRecentPing;
};

export const switchToFirmwareUpdate = (state: boolean) => {
  isFirmwareUpdate = state;
};

export const HeartBeatService: IService = {
  execute: async () => {
    try {
      if (isFirmwareUpdate) {
        updateLED(COLORS.PURPLE, COLORS.PURPLE, COLORS.PURPLE);
        return;
      }
      // ubxtool -p NAV-PVT | grep fix
      // grep fix ${GPS_ROOT_FOLDER}/"$(ls ${GPS_ROOT_FOLDER} | tail -1)" | tail -1
      exec(
        'ubxtool -p NAV-PVT | grep fix',
        {
          encoding: 'utf-8',
        },
        (error: ExecException | null, stdout: string) => {
          const ubxtoolOutput = error ? '' : stdout;

          exec(
            `systemctl is-active camera-bridge && ls ${FRAMES_ROOT_FOLDER} | tail -1`,
            {
              encoding: 'utf-8',
            },
            (error: ExecException | null, stdout: string) => {
              const cameraResponse = error ? '' : stdout;

              try {
                readFile(
                  NETWORK_CONFIG_PATH,
                  {
                    encoding: 'utf-8',
                  },
                  (err: NodeJS.ErrnoException | null, data: string) => {
                    const currentNetwork = err ? '' : data;

                    let gpsLED = COLORS.RED;
                    if (ubxtoolOutput.indexOf('fixType 3') !== -1) {
                      gpsLED = COLORS.GREEN;
                    } else if (ubxtoolOutput.indexOf('fixType 2') !== -1) {
                      gpsLED = COLORS.YELLOW;
                    }
                    setLockTime();

                    const imgLED =
                      cameraResponse.indexOf('active') === 0
                        ? cameraResponse !== previousCameraResponse
                          ? COLORS.GREEN
                          : COLORS.YELLOW
                        : COLORS.RED;
                    previousCameraResponse = cameraResponse;

                    const appDisconnectionPeriod = mostRecentPing
                      ? Math.abs(Date.now() - mostRecentPing)
                      : 30000;

                    let appLED = COLORS.RED;
                    if (appDisconnectionPeriod < 15000) {
                      appLED = COLORS.GREEN;
                    } else {
                      if (currentNetwork.indexOf('AP') === -1) {
                        if (appDisconnectionPeriod === 30000 || isPairing()) {
                          appLED = COLORS.BLUE;
                        } else {
                          appLED = COLORS.PINK;
                          repairNetworking(currentNetwork);
                        }
                      } else {
                        appLED = COLORS.YELLOW;
                      }
                    }
                    updateLED(imgLED, gpsLED, appLED);
                  },
                );
              } catch (e: unknown) {
                //
              }
            },
          );
        },
      );
    } catch (e: unknown) {
      console.log('LED service failed with error', e);
    }
  },
  interval: 7000,
};
