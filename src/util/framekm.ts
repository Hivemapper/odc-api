import { FRAMEKM_ROOT_FOLDER, FRAMES_ROOT_FOLDER } from 'config';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';

const MAX_PER_FRAME_BYTES = 2 * 1000 * 1000;
const MIN_PER_FRAME_BYTES = 25 * 1000;

export const concatFrames = async (
  frames: string[],
  framekmName: string,
): Promise<any> => {
  if (!existsSync(FRAMEKM_ROOT_FOLDER)) {
    mkdirSync(FRAMEKM_ROOT_FOLDER);
  }

  const bytesMap: { [key: string]: number } = {};
  let framesParsed = 0;
  for (const frame of frames) {
    try {
      const stat = statSync(FRAMES_ROOT_FOLDER + '/' + frame);
      if (stat.size > MIN_PER_FRAME_BYTES && stat.size < MAX_PER_FRAME_BYTES) {
        const frameBinary = readFileSync(FRAMES_ROOT_FOLDER + '/' + frame);
        if (!framesParsed) {
          writeFileSync(FRAMEKM_ROOT_FOLDER + '/' + framekmName, frameBinary);
        } else {
          appendFileSync(FRAMEKM_ROOT_FOLDER + '/' + framekmName, frameBinary);
        }
        bytesMap[frame] = stat.size;
        framesParsed++;
      }
    } catch (e: unknown) {
      console.log('Failed packing frame ' + frame, e);
    }
  }
  return bytesMap;
};
