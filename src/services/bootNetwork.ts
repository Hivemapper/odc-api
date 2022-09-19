import { IService } from 'types';

export const BootNetworkService: IService = {
  execute: async () => {
    try {
      // readFile(
      //   NETWORK_BOOT_CONFIG_PATH,
      //   {
      //     encoding: 'utf-8',
      //   },
      //   (err: NodeJS.ErrnoException | null, data: string) => {
      //     if (data && !err) {
      //       if (data.indexOf('P2P') === 0) {
      //         console.log('Starting P2P');
      //         exec(__dirname + '/network/test_P2Pconnect_any.sh', () => {
      //           // inProgress = false;
      //         });
      //       }
      //     }
      //   },
      // );
    } catch (e: unknown) {
      console.log(e);
    }
  },
  delay: 2000,
};
