import { MOTION_MODEL_CONFIG } from 'config';
import { readFile } from 'fs';
import { jsonrepair } from 'jsonrepair';
import { IService } from 'types';
import { fileExists } from 'util/index';
import { loadConfig } from 'util/motionModel';

export const UpdateMotionModelConfigService: IService = {
  execute: async () => {
    console.log('Updating motion model config');

    const exists = await fileExists(MOTION_MODEL_CONFIG);
    if (exists) {
      try {
        readFile(MOTION_MODEL_CONFIG, (err, data) => {
          if (err) throw err;
          try {
            const configJSON = JSON.parse(jsonrepair(data.toString()));
            if (configJSON && configJSON.DX) {
              // temporarily add default filter
              if (!configJSON.disableDefault) {
                configJSON.GnssFilter = {
                  '3dLock': true,
                  minSatellites: 4,
                  hdop: 4,
                  gdop: 6,
                  eph: 10,
                };
              }
              loadConfig(configJSON);
            }
          } catch (e: unknown) {
            console.log('Error parsing MM config', e);
          }
        });
      } catch (e: unknown) {
        console.log('Error initiating MM config', e);
      }
    } else {
      console.log('Motion model config is not set yet');
    }
  },
  delay: 200,
};
