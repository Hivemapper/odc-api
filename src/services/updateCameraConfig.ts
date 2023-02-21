import { exec } from 'child_process';
import {
  CAMERA_TYPE,
  CMD,
  IMAGER_BRIDGE_PATH,
  IMAGER_CONFIG_PATH,
} from 'config';
import { readFileSync, writeFile, writeFileSync } from 'fs';
import { CameraType, IService } from 'types';
import { getCameraConfig, sleep } from 'util/index';

export const UpdateCameraConfigService: IService = {
  execute: async () => {
    if (CAMERA_TYPE !== CameraType.Hdc) {
      return;
    }
    console.log('Updating camera config');

    try {
      const cameraConfig = await getCameraConfig();
      if (cameraConfig && cameraConfig.quality) {
        const newQuality = cameraConfig.quality;
        const bridgeScript = readFileSync(IMAGER_BRIDGE_PATH, {
          encoding: 'utf-8',
        });

        if (bridgeScript) {
          const parts = bridgeScript.split(' ');
          const qualityInd = parts.indexOf('--quality');

          if (qualityInd !== -1) {
            const oldQuality = Number(parts[qualityInd + 1]);
            if (oldQuality && newQuality) {
              const newScript = bridgeScript.replace(
                '--quality ' + oldQuality,
                '--quality ' + newQuality,
              );
              writeFileSync(IMAGER_BRIDGE_PATH, newScript);
            }
          }
        }
      }
      writeFile(
        IMAGER_CONFIG_PATH,
        JSON.stringify(cameraConfig),
        {
          encoding: 'utf-8',
        },
        () => restartCamera(),
      );
    } catch (e: unknown) {
      console.log('Camera Config service failed with error', e);
    }
  },
  delay: 200,
};

const restartCamera = () => {
  exec(CMD.STOP_CAMERA, async () => {
    // Give it a couple of seconds for it to fully stop before starting up again
    await sleep(2000);
    exec(CMD.START_CAMERA, () => {
      console.log('Successfully restarted the camera');
    });
  });
};
