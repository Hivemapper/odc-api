import { MOTION_MODEL_CONFIG } from 'config';
import { readFile } from 'fs';
import { jsonrepair } from 'jsonrepair';
import { getConfig, updateConfig } from 'sqlite/config';
import { IService } from 'types';
import { fileExists } from 'util/index';
import { getDefaultConfig } from 'util/motionModel/config';

export const UpdateMotionModelConfigService: IService = {
  execute: async () => {
    console.log('Updating system config');
    const DX = await getConfig('DX');

    if (!DX) {
      const defaultConfig = getDefaultConfig();
      const exists = await fileExists(MOTION_MODEL_CONFIG);
      if (exists) {
        try {
          readFile(MOTION_MODEL_CONFIG, (err, data) => {
            if (err) throw err;
            try {
              const configJSON = JSON.parse(jsonrepair(data.toString()));
              if (configJSON && configJSON.DX) {
                updateConfig({ ...defaultConfig, ...configJSON });
              }
            } catch (e: unknown) {
              console.log('Error parsing MM config', e);
              updateConfig(defaultConfig);
            }
          });
        } catch (e: unknown) {
          console.log('Error initiating MM config', e);
          updateConfig(defaultConfig);
        }
      } else {
        console.log('Motion model config is not set yet');
        updateConfig(defaultConfig);
      }
    }
  },
  delay: 200,
};
