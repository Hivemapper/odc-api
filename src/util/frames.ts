import { CAMERA_TYPE, FRAMES_LIST_FOLDER } from 'config';
import { readdir } from 'fs';
import { tmpFrameName } from 'routes/recordings';
import { CameraType, IImage } from 'types';
import { getClockFromFilename, getDateFromUnicodeTimestamp } from 'util/index';

export const getFramesFromFS = async (from: number, to: number): Promise<IImage[]> => {
  return new Promise(resolve => {
    try {
      readdir(
        FRAMES_LIST_FOLDER,
        (err: NodeJS.ErrnoException | null, files: string[]) => {
          try {
            if (files?.length) {
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
                    system_time: getDateFromUnicodeTimestamp(filename).getTime() * 10, // TODO: TEMP, FIX ON CAMERA END
                    clock: getClockFromFilename(filename),
                  };
                });

              let filteredFiles = jpgFiles.filter((file: IImage) => {
                return !(file.system_time < from || file.system_time > to);
              });
              let buffer = jpgFiles.length - filteredFiles.length;
              if (buffer < 20 && jpgFiles.length > 290 && CAMERA_TYPE === CameraType.Bee) {
                console.log("WARNING: Buffer is full!! Preventing first frame selection. They're about to be removed from RAM:");
                filteredFiles = filteredFiles.sort((a, b) => a.system_time - b.system_time).slice(20);
              } else {
                console.log(`Buffer: handicap ${buffer} frames.`);
              }

              resolve(filteredFiles);
            } else {
              resolve([]);
            }
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
