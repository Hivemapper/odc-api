import { spawn } from 'child_process';
import {
  DATA_INTEGRITY_SCRIPT,
  EVENTS_LOG_PATH,
  FRAMEKM_ROOT_FOLDER,
  METADATA_ROOT_FOLDER,
  UNPROCESSED_FRAMEKM_ROOT_FOLDER,
  WEBSERVER_LOG_PATH,
} from 'config';
import { promises, readdirSync } from 'fs';
import { join } from 'path';
import { getFrameKm } from 'sqlite/framekm';
import { IService } from 'types';
import { Instrumentation } from 'util/instrumentation';

let integrityCheckDone = false;

export const isIntegrityCheckDone = () => {
  return integrityCheckDone;
};

export const IntegrityCheckService: IService = {
  execute: async () => {
    const timeout = setTimeout(() => {
      integrityCheckDone = true;
    }, 60000);
    try {
      try {
        console.log('Running data integrity check');
        const unprocessedFrameKms = readdirSync(UNPROCESSED_FRAMEKM_ROOT_FOLDER);
        if (unprocessedFrameKms.length > 0) {
          for (const frameKmId of unprocessedFrameKms) {
            if (Number(frameKmId) > 0) {
              const frameKm = await getFrameKm(Number(frameKmId));
              if (!frameKm.length) {
                console.log('Empty FrameKM found: ' + frameKmId);
                try {
                  const framesFolder = join(
                    UNPROCESSED_FRAMEKM_ROOT_FOLDER,
                    frameKmId,
                  );
                  await promises.rmdir(framesFolder, { recursive: true });
                  Instrumentation.add({
                    event: 'DashcamEmptyFrameKm',
                    message: JSON.stringify({ id: frameKmId }),
                  });
                } catch (e: unknown) {
                  console.error('Error deleting framekm folder:', e);
                }
              }
            } else {
              console.log('Invalid FrameKM found: ' + frameKmId);
              try {
                const framesFolder = join(
                  UNPROCESSED_FRAMEKM_ROOT_FOLDER,
                  String(frameKmId),
                );
                await promises.rmdir(framesFolder, { recursive: true });
                Instrumentation.add({
                  event: 'DashcamInvalidFrameKm',
                  message: JSON.stringify({ id: frameKmId }),
                });
              } catch (e: unknown) {
                console.error('Error deleting framekm folder:', e);
              }
            }
          }
        }

        const cleanupScript = spawn('sh', [
          DATA_INTEGRITY_SCRIPT,
          FRAMEKM_ROOT_FOLDER,
          METADATA_ROOT_FOLDER,
          WEBSERVER_LOG_PATH,
          EVENTS_LOG_PATH,
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
