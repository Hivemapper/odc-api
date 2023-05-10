import { spawn } from 'child_process';
import {
  DATA_INTEGRITY_SCRIPT,
  FRAMEKM_ROOT_FOLDER,
  METADATA_ROOT_FOLDER,
  WEBSERVER_LOG_PATH,
} from 'config';
import { IService } from 'types';

let integrityCheckDone = false;

export const isIntegrityCheckDone = () => {
  return integrityCheckDone;
};

export const IntegrityCheckServive: IService = {
  execute: async () => {
    const timeout = setTimeout(() => {
      integrityCheckDone = true;
    }, 60000);
    try {
      try {
        const cleanupScript = spawn(DATA_INTEGRITY_SCRIPT, [
          FRAMEKM_ROOT_FOLDER,
          METADATA_ROOT_FOLDER,
          WEBSERVER_LOG_PATH,
        ]);

        cleanupScript.stdout.on('data', data => {
          console.log(data.toString());
        });

        cleanupScript.on('error', err => {
          console.log('Error executing data integrity script: ' + err);
          integrityCheckDone = true;
          clearTimeout(timeout);
        });

        cleanupScript.on('close', code => {
          console.log(`Data integrity script exited with code ${code}`);
          integrityCheckDone = true;
          clearTimeout(timeout);
        });
      } catch (error: unknown) {
        console.log(error);
        integrityCheckDone = true;
        clearTimeout(timeout);
      }
    } catch (e: unknown) {
      console.log('Problem running integrity check', e);
      integrityCheckDone = true;
      clearTimeout(timeout);
    }
  },
};
