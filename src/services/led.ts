import { exec, ExecException } from 'child_process';
import { FRAMES_ROOT_FOLDER, GPS_ROOT_FOLDER } from 'config';
import { IService } from 'types';
import { COLORS, updateLED } from '../util/led';

let mostRecentImg = '';
let mostRecentPing = -1;
let isFirmwareUpdate = false;

export const setMostRecentPing = (_mostRecentPing: number) => {
  mostRecentPing = _mostRecentPing;
};

export const switchToFirmwareUpdate = (state: boolean) => {
  isFirmwareUpdate = state;
};

export const LedService: IService = {
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
            'ls ' + FRAMES_ROOT_FOLDER + ' | tail -1',
            {
              encoding: 'utf-8',
            },
            (error: ExecException | null, stdout: string) => {
              const imgOutput = error ? '' : stdout;

              let gpsLED = COLORS.RED;
              if (ubxtoolOutput.indexOf('3D') !== -1) {
                gpsLED = COLORS.GREEN;
              } else if (ubxtoolOutput.indexOf('2D') !== -1) {
                gpsLED = COLORS.YELLOW;
              }

              const imgLED =
                imgOutput !== mostRecentImg ? COLORS.GREEN : COLORS.RED;
              const appLED =
                mostRecentPing && Math.abs(Date.now() - mostRecentPing) < 15000
                  ? COLORS.GREEN
                  : COLORS.YELLOW;

              updateLED(imgLED, gpsLED, appLED);
              mostRecentImg = imgOutput;
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
