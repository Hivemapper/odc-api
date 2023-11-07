import { existsSync, promises } from 'fs';
import { join } from 'path';

export const moveFrames = async (imagePaths: string[], destination: string) => {
  if (!existsSync(destination)) {
    await promises.mkdir(destination);
  }
  const movePromises = imagePaths.map(imagePath => {
    const destinationPath = join(destination, imagePath.split('/').pop()!);
    return promises.rename(imagePath, destinationPath);
  });
  return Promise.all(movePromises);
};
