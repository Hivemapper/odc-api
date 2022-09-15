import { exec, ExecException } from 'child_process';
import { IMAGER_CONFIG_PATH, IMAGER_EMMC_CONFIG_PATH } from 'config';
import { readFile, writeFile } from 'fs';
import { IService } from 'types';
import { ifTimeSet } from 'util/lock';

export const ImageRotationService: IService = {
  execute: async () => {
    try {
      readFile(
        IMAGER_CONFIG_PATH,
        {
          encoding: 'utf-8',
        },
        (err: NodeJS.ErrnoException | null, data: string) => {
          let config: any = {};
          if (data && !err) {
            config = JSON.parse(data);
          }

          if (
            config?.camera?.adjustment &&
            !config?.camera?.adjustment.rotation
          ) {
            config.camera.adjustment.rotation = 180;
            console.log('Set rotation to 180');
          }

          try {
            writeFile(
              IMAGER_CONFIG_PATH,
              JSON.stringify(config),
              {
                encoding: 'utf-8',
              },
              () => {
                if (ifTimeSet()) {
                  exec('systemctl stop camera-bridge', () => {
                    exec('systemctl start camera-bridge', () => {
                      console.log('Successfully restarted the camera');
                    });
                  });
                } else {
                  // do not restart the camera for image rotation
                  // it will be restarted on 3d lock anyways
                }
              },
            );
          } catch (e: unknown) {
            console.log('Image Rotation service failed with error', e);
          }
        },
      );
    } catch (e: unknown) {
      console.log('Image Rotation service failed with error', e);
    }
  },
  delay: 4000,
};
