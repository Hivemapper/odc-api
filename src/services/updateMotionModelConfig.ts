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
    const ScaleBoundingBox = await getConfig('ScaleBoundingBox', true);

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
    if (!ScaleBoundingBox) {
      // rewrite all the defaults once for privacy ML
      const defaultPrivacyValues = {
        'PrivacyModelPath': '/opt/dashcam/bin/n800_1x2_float16.tflite',
        'PrivacyModelHash': 'aed96116f29ed50e6844e5a5861c3d2316a6d2fb7a00afc4d248da8702d4e434',
        'PrivacyModelGridPath': '/opt/dashcam/bin/n800_2x2_float16.tflite',
        'PrivacyModelGridHash': 'e2f5488db4aa6bb0b1dba82476a238ca899c804cbee580f398051d62b7874702',
        'LowSpeedThreshold': 17,
        'PrivacyConfThreshold': 0.2,
        'PrivacyNmsThreshold': 0.8,
        'PrivacyNumThreads': 3,
        'ScaleBoundingBox': {},
      }
      for (const key in defaultPrivacyValues) {
        await setConfig(key, defaultPrivacyValues[key as keyof typeof defaultPrivacyValues]);
      }
    }
  },
  delay: 1000,
};
