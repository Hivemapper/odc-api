import { readdir, writeFile } from 'fs/promises';
import { CameraType, IService } from '../types';
import { CAMERA_TYPE, FRAMEKM_ROOT_FOLDER, METADATA_ROOT_FOLDER } from 'config';
import { existsSync, rename } from 'fs';
import { join } from 'path';
const REPAIRED_FRAMEKMS_LOG = '/mnt/data/framekms_repaired';

export const RepairFrameKms: IService = {
  execute: async () => {
    if (CAMERA_TYPE === CameraType.Hdc) {
      const done = existsSync(REPAIRED_FRAMEKMS_LOG);
      if (!done) {
        try {
          // making sure we perform this operation only once, even if it failed.
          // otherwise device can get into the retry loop messing up with a sync between phone and dashcam
          await writeFile(REPAIRED_FRAMEKMS_LOG, 'success', { encoding: 'utf8' });
          console.log('Executing script to rename FrameKMs/Metadata once');

          // read FrameKM files
          let files = await readdir(FRAMEKM_ROOT_FOLDER);
          if (files.length) {
            files.forEach(file => {
              const newFileName = file.slice(0, -2) + '_1';
              const oldFilePath = join(FRAMEKM_ROOT_FOLDER, file);
              const newFilePath = join(FRAMEKM_ROOT_FOLDER, newFileName);
              const oldMetadataPath = join(METADATA_ROOT_FOLDER, file + '.json');
              const newMetadataPath = join(METADATA_ROOT_FOLDER, newFileName + '.json');
  
              // rename FrameKM file
              rename(oldFilePath, newFilePath, err => {
                  if (err) {
                      console.error('Error renaming file:', err);
                  } else {
                      console.log(`Renamed ${oldFilePath} to ${newFileName}`);
                  }
              });
  
              // rename metadata file
              rename(oldMetadataPath, newMetadataPath, err => {
                  if (err) {
                      console.error('Error renaming file:', err);
                  } else {
                      console.log(`Renamed ${file} to ${newFileName}`);
                  }
              });
            });
          }
        } catch (e: unknown) {
          console.log(e);
          // even if failed, will have to write it anyway, to not stuck into repair loop
          await writeFile(REPAIRED_FRAMEKMS_LOG, JSON.stringify(e), { encoding: 'utf8' });
        }
      }
    }
  }
};
