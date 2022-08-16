import { IService } from 'types';

class ServiceRunner {
  services: IService[] = [];
  add(service: IService) {
    this.services.push(service);
  }
  run() {
    this.services.map((service: IService) => {
      if (service.interval) {
        const interval = setInterval(() => {
          try {
            service.execute();
            if (service.executeOnce) {
              clearInterval(interval);
            }
          } catch (e: unknown) {
            console.log('Service error', e);
          }
        }, service.interval);
      } else {
        try {
          service.execute();
        } catch (e: unknown) {
          console.log('Service stopped with error', e);
        }
      }
    });
  }
}

export const serviceRunner = new ServiceRunner();
