import { exec } from 'child_process';

let inProgress = false;

export const isPairing = () => {
  return inProgress;
};
/**
 * Workaround for networking
 * If App disconnected from the Camera,
 * Camera could stuck in P2P experience,
 * Easiest workaround - to switch to AP
 * TODO: more robust approach
 */
export const repairNetworking = (currentNetwork: string) => {
  if (inProgress) {
    return;
  }
  inProgress = true;
  try {
    if (currentNetwork.indexOf('AP') === -1) {
      exec(__dirname + '/network/wifi_P2Pconnect_any.sh', () => {
        inProgress = false;
      });
    } else {
      inProgress = false;
    }
  } catch (e: unknown) {
    console.log(e);
    inProgress = false;
  }
};
