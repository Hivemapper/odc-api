import { existsSync, mkdir, readFileSync, readdirSync, rmSync } from 'fs';
import path from 'path';
import { promiseWithTimeout, sleep, stopScriptIfRunning } from 'util/index';
import { CAMERA_TYPE, DEFAULT_MODEL_PATH, ML_METADATA_ROOT_FOLDER, ML_SCRIPT_PATH, UNPROCESSED_FRAMEKM_ROOT_FOLDER, UNPROCESSED_METADATA_ROOT_FOLDER } from 'config';
import { getNumFramesFromChunkName, packMetadata } from 'util/motionModel';
import { ChildProcess, exec, spawn } from 'child_process';
import { concatFrames } from 'util/framekm';
import { Instrumentation } from 'util/instrumentation';
import { CameraType } from 'types';
let privacyProcess: ChildProcess | null = null;
let isProcessClosed = true;
let prevFolder = '';
let countAttempts = 0;
const ITERATION_DELAY = 2000;

export const restartPrivacyProcess = () => {
    try {
        if (privacyProcess && !privacyProcess.killed) {
            console.log('Process is still alive');
            privacyProcess.kill('SIGKILL');
        }
    } catch (err) {
        console.log('Process is terminated already');
        isProcessClosed = true;
    }
};

const execute = async () => {
    try {
      if (!existsSync(UNPROCESSED_FRAMEKM_ROOT_FOLDER)) {
        try {
          await new Promise(resolve => {
            mkdir(UNPROCESSED_FRAMEKM_ROOT_FOLDER, resolve);
          });
        } catch (e: unknown) {
          console.log(e);
        }
      }
      if (!existsSync(UNPROCESSED_METADATA_ROOT_FOLDER)) {
        try {
          await new Promise(resolve => {
            mkdir(UNPROCESSED_METADATA_ROOT_FOLDER, resolve);
          });
        } catch (e: unknown) {
          console.log(e);
        }
      }
    
      checkMlProcess();

      let list = readdirSync(UNPROCESSED_FRAMEKM_ROOT_FOLDER).sort();
      const readyFolders = list.filter((f) => f.startsWith('ready_') && f.endsWith('_bundled'));
      if (readyFolders.length > 0) {
        const readyFolder = readyFolders[0];
        const framesFolderPath = path.join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, readyFolder);

        if (readyFolder === prevFolder) {
          countAttempts++;
          if (countAttempts > 4) {
            console.log(`Stuck on ${readyFolder}. Cleaning up.`);
            countAttempts = 0;
            try {
              rmSync(framesFolderPath, { recursive: true, force: true });
            } catch (e: unknown) {
              console.log(e);
            }
            await sleep(ITERATION_DELAY);
            execute();
            return;
          }
        } else {
          countAttempts = 0;
        }
        prevFolder = readyFolder;

        list = readdirSync(framesFolderPath).sort();
        // split the list by bundles
        const bundles: Record<string, string[]> = {};
        for (const file of list) {
          const bundleName = file.split('ww')[0];
          bundles[bundleName] = bundles[bundleName] || [];
          bundles[bundleName].push(file);
        }
        for (const chunkName of Object.keys(bundles)) {

          const metadataPath = path.join(UNPROCESSED_METADATA_ROOT_FOLDER, chunkName + '.json');

          if (existsSync(metadataPath)) {
            let metadata;
            try {
              metadata = JSON.parse(readFileSync(metadataPath, { encoding: 'utf-8' }));
            } catch (e: unknown) {
              console.log('Error parsing metadata', e);
            }
            if (metadata) {
              const chunkFrames = bundles[chunkName];
              try {
                const start = Date.now();
                const bytesMap = await promiseWithTimeout(
                  concatFrames(
                    chunkFrames,
                    chunkName,
                    0,
                    framesFolderPath,
                    true
                  ),
                  Math.max(5000, 300 * getNumFramesFromChunkName(chunkName))
                );
                let totalBytes = 0;
                if (bytesMap && Object.keys(bytesMap).length) {
                  totalBytes = (Object.values(bytesMap) as number[]).reduce(
                    (acc: number, curr: number | undefined) =>
                      acc + (Number(curr) || 0),
                    0,
                  );
                  await promiseWithTimeout(
                    packMetadata(
                      chunkName,
                      metadata.frames,
                      chunkFrames.map((f) => ({ path: f.split('ww')[1], date: 0 })),
                      bytesMap,
                      true
                    ),
                    5000,
                  );
                  rmSync(metadataPath);
                }
                Instrumentation.add({
                  event: 'DashcamPackedPostProcessedFrameKm',
                  size: totalBytes,
                  message: JSON.stringify({
                    name: chunkName,
                    numFrames: chunkFrames.length,
                    duration: Date.now() - start,
                  }),
                });
              } catch (error: unknown) {
                Instrumentation.add({
                  event: 'DashcamFailedPackingFrameKm',
                  message: JSON.stringify({
                    name: chunkName,
                    reason: 'ML Post-Processing Error',
                    error,
                  }),
                });
                console.log(error);
              }
            }
          }
        }
        try {
          rmSync(framesFolderPath, { recursive: true, force: true });
        } catch (e: unknown) {
          console.log(e);
        }
      }
    } catch (e) {
        console.log('Privacy Watcher error', e);
    }

    await sleep(ITERATION_DELAY);
    execute();
};

const checkMlProcess = async () => {
    // if (!getConfig().isDashcamMLEnabled) {
    //   return false;
    // }
    if (isProcessClosed) {
        isProcessClosed = false;
        await stopScriptIfRunning('privacy.py');
        console.log('Starting the process');

        // let modelPath = ML_MODELS.PVC;
        // if (!existsSync(ML_MODELS.PVC)) {
        //   modelPath = DEFAULT_MODEL_PATH
        // }

        let cmdArgs = [
          ML_SCRIPT_PATH,
          '--input_path', UNPROCESSED_FRAMEKM_ROOT_FOLDER,
          '--output_path', ML_METADATA_ROOT_FOLDER,
          '--model_path', DEFAULT_MODEL_PATH,
          '--num_threads', CAMERA_TYPE === CameraType.Hdc ? 4 : 8,
      ];

        const isCpuLimitRequired = CAMERA_TYPE === CameraType.Hdc;
        
        if (isCpuLimitRequired) {
          // @ts-ignore
          cmdArgs = ['-l', '160', 'python'].concat(cmdArgs);
        }

        try {
          exec('sysctl vm.swappiness=10');
        } catch (err: unknown) {
          console.log('Error executing sysctl', err);
        }
        
        // privacyProcess = spawn(isCpuLimitRequired ? 'cpulimit' : 'python3', cmdArgs.map(s => String(s)), { detached: true });
        
        // privacyProcess.on('close', (code) => {
        //     console.log(`Process closed with code ${code}`);
        //     isProcessClosed = true;
        // });

        // privacyProcess.unref();
    }
}

export const PrivacyWatcherService = {
    execute,
};