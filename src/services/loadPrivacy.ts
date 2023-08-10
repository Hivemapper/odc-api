import { readFile } from 'fs';
import { IService } from '../types';
import { fileExists } from 'util/index';
import { PRIVACY_ZONES_CONFIG } from 'config';
import { jsonrepair } from 'jsonrepair';
import { setPrivateZones } from 'util/privacy';

let isInitialised = false;

export const isPrivateZonesInitialised = () => {
  return isInitialised;
}

export const LoadPrivacyService: IService = {
  execute: async () => {
    const exists = await fileExists(PRIVACY_ZONES_CONFIG);
    if (exists) {
      try {
        readFile(PRIVACY_ZONES_CONFIG, (err, data) => {
          if (err) throw err;
          try {
            let fileContents = '[]';
            const output = data.toString();
            if (output) {
              try {
                fileContents = jsonrepair(output);
              } catch (err: unknown) {
                console.log(err);
              }
            }
            const privacyZones = JSON.parse(fileContents);
            if (privacyZones?.length) {
              setPrivateZones(privacyZones);
            }
            isInitialised = true;
          } catch (e: unknown) {
            console.log('Error parsing privacy config', e);
            isInitialised = true;
          }
        });
      } catch (e: unknown) {
        console.log('Error initiating privacy config', e);
        isInitialised = true;
      }
    } else {
      isInitialised = true;
    }
  },
  delay: 500,
};
