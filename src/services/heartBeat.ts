import { exec, ExecException } from 'child_process';
import { GPS_ROOT_FOLDER } from 'config';
import { IService } from 'types';
import { setLockTime } from 'util/lock';
import { repairNetworking } from 'util/network';
import { COLORS, updateLED } from '../util/led';

// let mostRecentImg = '';
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
      exec(
        `grep fix ${GPS_ROOT_FOLDER}/"$(ls ${GPS_ROOT_FOLDER} | tail -1)" | tail -1`,
        {
          encoding: 'utf-8',
        },
        (error: ExecException | null, stdout: string) => {
          const ubxtoolOutput = error ? '' : stdout;

          exec(
            'systemctl is-active camera-bridge',
            {
              encoding: 'utf-8',
            },
            (error: ExecException | null, stdout: string) => {
              const isCameraBridgeActive = error ? '' : stdout;

              let gpsLED = COLORS.RED;
              if (ubxtoolOutput.indexOf('3D') !== -1) {
                gpsLED = COLORS.GREEN;
                setLockTime();
              } else if (ubxtoolOutput.indexOf('2D') !== -1) {
                gpsLED = COLORS.YELLOW;
              }

              const imgLED = isCameraBridgeActive.indexOf('active') === 0 ? COLORS.GREEN : COLORS.RED;

              const appDisconnectionPeriod = mostRecentPing ? Math.abs(Date.now() - mostRecentPing) : 30000;
              const appLED =
                appDisconnectionPeriod < 15000
                  ? COLORS.GREEN
                  : COLORS.YELLOW;

              if (appDisconnectionPeriod > 31000 && appDisconnectionPeriod < 40000) {
                repairNetworking();
              }

              updateLED(imgLED, gpsLED, appLED);
              // mostRecentImg = imgOutput;
            },
          );
        },
      );
    } catch (e: unknown) {
      console.log('LED service failed with error', e);
    }
  },
  interval: 5000,
};
