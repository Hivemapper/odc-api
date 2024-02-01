import { exec } from 'child_process';
import { USB_WRITE_PATH } from 'config';
import { promisify } from 'util';
import { IService } from '../types';
import { parse } from 'path';
import { Instrumentation } from 'util/instrumentation';

const awaitableExec = promisify(exec);

let previousUsbMountedState : boolean | null = null;

export const getUsbState = (): boolean => {
  return Boolean(previousUsbMountedState);
}

export const UsbStateCheckService: IService = {
  execute: async () => {
    const usbMountPoint = parse(USB_WRITE_PATH).dir; 
    
    let usbIsMounted = true;
    try {
      await awaitableExec(`mountpoint -q ${usbMountPoint}`);
    } catch (error) {
      usbIsMounted = false;
    }

    if (previousUsbMountedState != usbIsMounted) {
      Instrumentation.add({
        event: 'DashcamUSBState',
        message: JSON.stringify({
          status: usbIsMounted ? 'connected' : 'disconnected',
        })
      }),
      previousUsbMountedState = usbIsMounted;
    }
  },
  interval: 15000,
};
