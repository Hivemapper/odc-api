import { exec } from 'child_process';
import { USB_WRITE_PATH } from 'config';
import { promisify } from 'util';
import { IService } from '../types';
import { parse } from 'path';
import { Instrumentation } from 'util/instrumentation';

const awaitableExec = promisify(exec);

let previousUsbMountedState : boolean | null = null;

export const usbStateCheckService: IService = {
  execute: async () => {
    console.log('checking usb mount');
    const usbMountPoint = parse(USB_WRITE_PATH).dir; 
    
    let usbIsMounted = true;
    try {
      await awaitableExec(`mountpoint -q ${usbMountPoint}`);
    } catch (error) {
      usbIsMounted = false;
    }

    console.log(`prev ${previousUsbMountedState} now ${usbIsMounted}`);
    if (previousUsbMountedState != usbIsMounted) {
      Instrumentation.add({
        event: 'USBState',
        message: JSON.stringify({
          status: usbIsMounted ? 'connected' : 'disconnected',
        })
      }),
      previousUsbMountedState = usbIsMounted;
    }

  },
  interval: 5000,
};
