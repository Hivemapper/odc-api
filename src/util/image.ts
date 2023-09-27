import gm from 'gm';
import path from 'path';

import { runCommand, spawnProcess, tryToRemoveFile } from './';
import { BoundingBox2D, Dimensions } from '../types';
import { PUBLIC_FOLDER } from 'config';

const im = gm.subClass({ imageMagick: true });

export async function imageDimensions(path: string) {
  return new Promise<Dimensions>((resolve, reject) => {
    im(path).size((err: unknown, size: Dimensions) => {
      if (err) {
        reject(err);
      }
      resolve(size);
    });
  });
}

export async function makeMask(
  width: number,
  height: number,
  outPath: string,
  regions: BoundingBox2D[],
  xc = 'white',
  fill = 'black',
) {
  let maskCmd = `-size ${width}x${height} xc:${xc} -fill ${fill} -draw "`;
  for (const r of regions) {
    const w = r.width;
    const h = r.height;
    const x1 = r.cx - w / 2;
    const y1 = r.cy - h / 2;
    const x2 = r.cx + w / 2;
    const y2 = r.cy + h / 2;
    maskCmd += ` rectangle ${x1},${y1} ${x2},${y2}`;
  }
  maskCmd += `" ${outPath}`;

  await runCommand('convert', maskCmd.split(' '));
}

/**
 * Not performant
 */
export async function naiveBlur(
  imagePath: string,
  outPath: string,
  radius: number,
  sigma: number,
) {
  const blurCmd = `-blur ${radius}x${sigma} ${imagePath} ${outPath}`;
  await spawnProcess('convert', blurCmd.split(' '));
}

/**
 * Write a new blurred image using a quick method
 * 1) scale image down
 * 2) blur image
 * 3) scale image up
 * 4) combine images with a mask from regions
 */
export async function blurImageRegions(
  imagePath: string,
  outPath: string,
  regions: BoundingBox2D[],
  blur = 1.5,
  scale = 0.2,
  quality = 0.8,
) {
  const { width, height } = await imageDimensions(imagePath);

  const downPct = (100 * scale).toFixed(0);
  const upPct = (100 * (1 / scale)).toFixed(0);
  const qualityPct = (100 * quality).toFixed(0);
  const time = Date.now();
  const imageName = imagePath.split('/').pop();
  const blurPath = path.join(PUBLIC_FOLDER, `blur-${time}-${imageName}`);
  const maskPath = path.join(PUBLIC_FOLDER, `mask-${time}-${imageName}`);

  const blurCmd = `-scale ${downPct}% -blur 0x${blur} -resize ${upPct}% ${imagePath} ${blurPath}`;
  const compositeCmd = `-size ${width}x${height} -quality ${qualityPct}% tile:${imagePath} tile:${blurPath} ${maskPath} -composite ${outPath}`;

  try {
    // create blurred image
    await spawnProcess('convert', blurCmd.split(' '));
    // create mask
    await makeMask(width, height, maskPath, regions, 'black', 'white');
    // composite
    await spawnProcess('convert', compositeCmd.split(' '));
  } catch (err: any) {
    tryToRemoveFile(blurPath);
    tryToRemoveFile(maskPath);
    throw err;
  }

  tryToRemoveFile(blurPath);
  tryToRemoveFile(maskPath);
}
