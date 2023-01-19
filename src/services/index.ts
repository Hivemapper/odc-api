import { IService } from 'types';

class ServiceRunner {
  services: IService[] = [];
  add(service: IService) {
    this.services.push(service);
  }
  run() {
    this.services.forEach(async (service: IService) => {
      if (service.interval || service.delay) {
        const interval = setInterval(async () => {
          try {
            await service.execute();
            if (service.delay) {
              clearInterval(interval);
            }
          } catch (e: unknown) {
            console.log('Service error', e);
          }
        }, service.interval || service.delay);
        if (!service.delay) {
          await service.execute();
        }
      } else {
        try {
          await service.execute();
        } catch (e: unknown) {
          console.log('Service stopped with error', e);
        }
      }
    });
  }
}

export const serviceRunner = new ServiceRunner();
