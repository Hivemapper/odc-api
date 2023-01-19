import { exec, ExecException } from 'child_process';
import { IService } from 'types';
import { sleep } from 'util/index';

export const GnssHealthCheck: IService = {
  execute: async () => {
    try {
      exec(
        `systemctl is-active gpsd`,
        {
          encoding: 'utf-8',
        },
        async (error: ExecException | null, stdout: string) => {
          const cmdOutput = error ? '' : stdout;

          if (cmdOutput.indexOf('active') !== 0) {
            exec('systemctl start gpsd');
            // console.log('GPSD was down. Bringing back!');
            await sleep(2000);
          }

          exec(
            `systemctl is-active gnss-logger`,
            {
              encoding: 'utf-8',
            },
            async (error: ExecException | null, stdout: string) => {
              const cmdOutput = error ? '' : stdout;

              if (cmdOutput.indexOf('active') !== 0) {
                exec('systemctl start gnss-logger');
                // console.log('Gnss-logger was down. Bringing back!');
              }
            },
          );
        },
      );
    } catch (e: unknown) {
      console.log('LED service failed with error', e);
    }
  },
  interval: 15051,
};
