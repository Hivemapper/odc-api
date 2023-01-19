import { serviceRunner } from 'services';
import { HeartBeatService } from 'services/heartBeat';
import { InitCronService } from 'services/initCron';
import { GnssHealthCheck } from 'services/gnssHealthCheck';
import { UpdateCameraConfigService } from 'services/updateCameraConfig';
import { DeviceInfoService } from 'services/deviceInfo';
import { TrackDownloadDebt } from 'services/trackDownloadDebt';
import { setSessionId } from 'util/index';

export const runServices = (): void => {
  try {
    serviceRunner.add(HeartBeatService);
    serviceRunner.add(UpdateCameraConfigService);
    serviceRunner.add(DeviceInfoService);
    serviceRunner.add(GnssHealthCheck);
    serviceRunner.add(InitCronService);
    serviceRunner.add(TrackDownloadDebt);
    serviceRunner.run();
    setSessionId();
  } catch (e: unknown) {
    console.log('Error running services:', e);
  }
};
