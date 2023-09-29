import { spawn } from 'child_process';
import { FRAMEKM_ROOT_FOLDER, FRAMES_ROOT_FOLDER, GPS_ROOT_FOLDER, IMU_ROOT_FOLDER, METADATA_ROOT_FOLDER, PUBLIC_FOLDER, UNPROCESSED_FRAMEKM_ROOT_FOLDER } from 'config';

import { IService } from '../types';
import { DiskUsage } from 'types/motionModel';
import { stat } from 'fs';

const diskUsage: DiskUsage = {};

export const getDiskUsage = () => {
  return diskUsage;
};

export const LogDiskUsageService: IService = {
  execute: async () => {
    try {
      let output = '';
      const command = 'sh';
      const args = [
        '-c',
        `du -b ${PUBLIC_FOLDER}`
      ];
      const diskUsageCmd = spawn(command, args);

      diskUsageCmd.stdout.on('data', data => {
        output += data.toString();
      });

      diskUsageCmd.stderr.on('data', data => {
        console.error(`stderr: ${data}`);
      });

      diskUsageCmd.on('error', err => {
        console.log('Error executing du -b: ' + err);
      });

      diskUsageCmd.on('close', () => {
        try {
          const lines = output.trim().split('\n');
          const usage: { [key: string]: number } = {};

          lines.forEach(line => {
            const [size, path] = line.split(/\s+/);
            const sizeKB = Math.round(parseInt(size, 10) / 1024);
            if (Number.isInteger(sizeKB)) {
              usage[path] = sizeKB;
            }
          });

          if (usage[FRAMEKM_ROOT_FOLDER]) {
            diskUsage.frameKm = usage[FRAMEKM_ROOT_FOLDER];
          }
          if (usage[GPS_ROOT_FOLDER]) {
            diskUsage.gps = usage[GPS_ROOT_FOLDER];
          }
          if (usage[IMU_ROOT_FOLDER]) {
            diskUsage.imu = usage[IMU_ROOT_FOLDER];
          }
          if (usage[METADATA_ROOT_FOLDER]) {
            diskUsage.metadata = usage[METADATA_ROOT_FOLDER];
          }
          if (usage[UNPROCESSED_FRAMEKM_ROOT_FOLDER]) {
            diskUsage.ml = usage[UNPROCESSED_FRAMEKM_ROOT_FOLDER];
          }
          if (usage[PUBLIC_FOLDER]) {
            diskUsage.total = usage[PUBLIC_FOLDER];
          }
          if (usage[FRAMES_ROOT_FOLDER]) {
            diskUsage.pic = usage[FRAMES_ROOT_FOLDER];
          } else {
            stat(FRAMES_ROOT_FOLDER, (err, stats) => {
              if (err) {
                console.log('Error getting pic folder size', err);
              } else {
                diskUsage.pic = stats.size;
              }
            });
          }
          console.log('Disk usage:', diskUsage);
        } catch (e: unknown) {
          console.log('Error parsing disk usage', e);
        }
      });
    } catch (error: unknown) {
      console.log(error);
    }
  },
  interval: 118888,
};
