import { existsSync, readFileSync, readdirSync, renameSync } from 'fs';
import path from 'path';
import { IService } from '../types';
import { promiseWithTimeout, runCommand, sleep } from 'util/index';
import { METADATA_ROOT_FOLDER, ML_MODELS, UNPROCESSED_FRAMEKM_ROOT_FOLDER, UNPROCESSED_METADATA_ROOT_FOLDER } from 'config';
import { getConfig, getNumFramesFromChunkName } from 'util/motionModel';
import { blurImageRegions } from 'util/image';

const execute = async () => {
    try {
        const list = readdirSync(UNPROCESSED_FRAMEKM_ROOT_FOLDER).filter((f) => f.startsWith('km_'));
        if (list.length) {
            const frameKmName = list[0];
            const frameKmPath = path.join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, frameKmName);
            const detectionsPath = path.join(frameKmPath, 'detections.json');
            try {
                const privacyConfig = getConfig().Privacy || {};

                const detect = runCommand('python', [
                    '/opt/dashcam/bin/ml/privacy.py',
                    '--input_path',
                    frameKmPath,
                    '--output_path',
                    detectionsPath,
                    '--model_path',
                    ML_MODELS.PVC,
                    '--num_threads',
                    privacyConfig.numThreads || 8,
                    '--conf_threshold',
                    privacyConfig.numThreads || 0.5,
                    '--iou_threshold',
                    privacyConfig.numThreads || 0.5,
                ]);

                // Let's timeout the process after 3 seconds per frame
                const timeout = getNumFramesFromChunkName(frameKmName) * 3000;
                await promiseWithTimeout(detect, timeout);

                if (existsSync(detectionsPath)) {
                    const detections = JSON.parse(readFileSync(detectionsPath).toString());
                    for (const img of Object.keys(detections)) {
                        // filter out face and person detections
                        const privacyDetections = detections[img].filter((d: any) => [0, 1].includes(d[2]));
                        if (privacyDetections.length) {
                            const imgPath = path.join(frameKmPath, img);
                            await blurImageRegions(imgPath, imgPath, privacyDetections);
                        }
                    }
                }
            } finally {
                // pack frames + update metadata file
                await packFrameKM(frameKmPath);
                // move final metadata file to processed folder
                await renameSync(path.join(UNPROCESSED_METADATA_ROOT_FOLDER, frameKmName + '.json'), path.join(METADATA_ROOT_FOLDER, frameKmName + '.json'));
            }
        }
    } catch (e: unknown) {
        console.log('Privacy Watcher error', e);
    }
    await sleep(1000);
    execute();
}

export const PrivacyWatcherService: IService = {
    execute,
};