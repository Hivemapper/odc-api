import { FRAMES_ROOT_FOLDER } from 'config';
import { existsSync, promises } from 'fs';
import { join } from 'path';

export const moveFrames = async (images: string[], destination: string, originPath = FRAMES_ROOT_FOLDER) => {
  if (!existsSync(destination)) {
    await promises.mkdir(destination);
  }
  const movePromises = images.map((image: string) => {
    const imagePath = join(originPath, image);
    const destinationPath = join(destination, image);

    // TODO: Better to use rename() here, but it didn't work across all devices:
    // HDC: Error: EXDEV: cross-device link not permitted, rename '/tmp/recording/pic/1699566236_360930.jpg' -> '/mnt/data/unprocessed_framekm/km_20231109_214351_0_0/1699566236_360930.jpg'
    // Investigate
    return promises.copyFile(imagePath, destinationPath);
  });
  return Promise.all(movePromises);
};
