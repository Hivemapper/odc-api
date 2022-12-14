import { existsSync, readFile, rmSync } from 'fs';
import { execSync } from 'child_process';
import { DeviceInfo, IService } from '../types';
import { sleep } from 'util/index';
import { DEVICE_INFO_LOG_FILE, CMD } from 'config';

let deviceInfo: DeviceInfo = {
  serial: '',
  ssid: '',
  boardConfig: '',
};
export const getDeviceInfo = () => {
  return deviceInfo;
};

export const DeviceInfoService: IService = {
  execute: async () => {
    try {
      if (existsSync(DEVICE_INFO_LOG_FILE)) {
        rmSync(DEVICE_INFO_LOG_FILE);
      }
      execSync(CMD.READ_DEVICE_INFO);
      await sleep(3000);
      if (existsSync(DEVICE_INFO_LOG_FILE)) {
        readFile(
          DEVICE_INFO_LOG_FILE,
          (err: NodeJS.ErrnoException | null, data: Buffer) => {
            if (!err && data) {
              //@ts-ignore
              const parts = data.toString().split('+');
              if (parts && parts.length && parts.length >= 3) {
                deviceInfo = {
                  ssid: parts[0],
                  boardConfig: parts[1],
                  serial: parts[2].split('\n')[0],
                };
              }
            } else {
              console.log('Error reading serial data', err);
            }
          },
        );
      }
    } catch (e: unknown) {
      console.log('Error writing serial data');
    }
  },
  delay: 0,
};
