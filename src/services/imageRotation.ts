import { exec, ExecException } from 'child_process';
import { IMAGER_CONFIG_PATH } from 'config';
import { readFile, writeFile } from 'fs';
import { IService } from 'types';

export const ImageRotationService: IService = {
  execute: async () => {
    try {
      exec(
        'systemctl stop camera-bridge',
        {
          encoding: 'utf-8',
        },
        (error: ExecException | null) => {
          if (!error) {
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
                        exec('systemctl start camera-bridge');
                        console.log('Successfully restarted the camera');
                      },
                    );
                  } catch (e: unknown) {
                    console.log(e);
                    exec('systemctl start camera-bridge');
                  }
                },
              );
            } catch (e: unknown) {
              console.log(e);
              exec('systemctl start camera-bridge');
            }
          } else {
            exec('systemctl start camera-bridge');
          }
        },
      );
    } catch (e: unknown) {
      console.log('LED service failed with error', e);
      exec('systemctl start camera-bridge');
    }
  },
  interval: 15000,
  executeOnce: true,
};
