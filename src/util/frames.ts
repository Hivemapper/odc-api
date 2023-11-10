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
    return promises.copyFile(imagePath, destinationPath);
  });
  return Promise.all(movePromises);
};
