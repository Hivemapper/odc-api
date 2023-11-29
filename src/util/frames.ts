import { FRAMES_ROOT_FOLDER } from 'config';
import { readdir } from 'fs';
import { tmpFrameName } from 'routes/recordings';
import { IImage } from 'types';
import { getDateFromUnicodeTimestamp } from 'util/index';

export const getFramesFromFS = async (from: number, to: number): Promise<IImage[]> => {
  return new Promise(resolve => {
    try {
      readdir(
        FRAMES_ROOT_FOLDER,
        (err: NodeJS.ErrnoException | null, files: string[]) => {
          try {
            const jpgFiles: IImage[] = files
              .filter(
                (filename: string) =>
                  filename.indexOf('.jpg') !== -1 &&
                  filename.indexOf('.tmp') === -1 &&
                  filename !== tmpFrameName,
              )
              .map(filename => {
                return {
                  image_name: filename,
                  system_time: getDateFromUnicodeTimestamp(filename).getTime(),
                };
              });

            const filteredFiles = jpgFiles.filter((file: IImage) => {
              return !(file.system_time < from || file.system_time > to);
            });

            resolve(filteredFiles);
          } catch (error) {
            console.log(error);
            resolve([]);
          }
        },
      );
    } catch (error) {
      console.log(error);
      resolve([]);
    }
  });
};
