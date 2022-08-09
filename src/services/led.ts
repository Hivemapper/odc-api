import { exec, ExecException } from 'child_process';
import { FRAMES_ROOT_FOLDER } from 'config';
import { IService } from 'types';
import { COLORS, updateLED } from '../util/led';

let mostRecentImg = '';
let mostRecentPing = -1;

export const setMostRecentPing = (_mostRecentPing: number) => {
  mostRecentPing = _mostRecentPing;
};

export const LedService: IService = {
  execute: async () => {
    try {
      exec(
        'ubxtool -p NAV-PVT | grep fix',
        {
          encoding: 'utf-8',
        },
        (error: ExecException | null, stdout: string) => {
          if (stdout && !error) {
            const ubxtoolOutput = stdout;

            exec(
              'ls ' + FRAMES_ROOT_FOLDER + ' | tail -1',
              {
                encoding: 'utf-8',
              },
              (error: ExecException | null, stdout: string) => {
                if (stdout && !error) {
                  const imgOutput = stdout;

                  let gpsLED = COLORS.RED;
                  if (ubxtoolOutput.indexOf('fixType 3') !== -1) {
                    gpsLED = COLORS.GREEN;
                  } else if (ubxtoolOutput.indexOf('fixType 2') !== -1) {
                    gpsLED = COLORS.YELLOW;
                  }

                  const imgLED =
                    imgOutput !== mostRecentImg ? COLORS.GREEN : COLORS.RED;
                  const appLED =
                    mostRecentPing &&
                    Math.abs(Date.now() - mostRecentPing) < 15000
                      ? COLORS.GREEN
                      : COLORS.YELLOW;

                  updateLED(imgLED, gpsLED, appLED);
                  mostRecentImg = imgOutput;
                }
              },
            );
          }
        },
      );
    } catch (e: unknown) {
      console.log('LED service failed with error', e);
    }
  },
  interval: 5000,
};
