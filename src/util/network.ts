import { readFile } from 'fs';
import { exec } from 'child_process';

const NETWORK_CONFIG_PATH = __dirname + '/../network-mode.txt';
let inProgress = false;

/**
 * Workaround for networking
 * If App disconnected from the Camera,
 * Camera could stuck in P2P experience,
 * Easiest workaround - to switch to AP
 * TODO: more robust approach
 */
export const repairNetworking = () => {
  if (inProgress) {
    return;
  }
  inProgress = true;
  try {
    readFile(
      NETWORK_CONFIG_PATH,
      {
        encoding: 'utf-8',
      },
      (err: NodeJS.ErrnoException | null, data: string) => {
        if (data && !err) {
          if (data.indexOf('AP') !== 0) {
            console.log('Repairing the network');
            exec(__dirname + '/network/wifi_switch_AP.sh', () => {
              inProgress = false;
            });
          } else {
            inProgress = false;
          }
        } else {
          inProgress = false;
        }
      }
    );
  } catch (e: unknown) {
    console.log(e);
    inProgress = false;
  }
}