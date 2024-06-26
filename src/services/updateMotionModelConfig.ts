import { MOTION_MODEL_CONFIG } from 'config';
import { readFile } from 'fs';
import { jsonrepair } from 'jsonrepair';
import { getConfig, getDefaultConfig, setConfig, updateConfig } from 'sqlite/config';
import { IService } from 'types';
import { fileExists } from 'util/index';

export const UpdateMotionModelConfigService: IService = {
  execute: async () => {
    const DX = await getConfig('DX', true);
    const isProcessingEnabled = await getConfig('isProcessingEnabled', true);

    if (!DX) {
      console.log('Updating system config');
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
    if (isProcessingEnabled === undefined) {
      await setConfig('isProcessingEnabled', true);
    }
  },
  delay: 1000,
};
