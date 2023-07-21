import fetch from "node-fetch";
import { mkdir, writeFileSync } from 'fs';
import { RAW_DATA_ROOT_FOLDER } from '../config';
import console from 'console';

const HDC_DATA_LOGGER = "http://192.168.0.10:9001";

export async function getRawImuData(from: string, to: string) {
  const GET_RAW_IMU_DATA = `${HDC_DATA_LOGGER}/imu?from=${encodeURI(
    from,
  )}&to=${encodeURI(to)}`;
  console.log("calling endpoint: ", GET_RAW_IMU_DATA);
  try {
    const options = {
      headers: {
        'Content-Type': 'application/x-gzip',
      },
    };
    const resp = await fetch(GET_RAW_IMU_DATA, options);
    return resp.blob();
  } catch (error) {
    console.error('failed to fetch raw imu data', error);
  }
}

export async function writeRawData(blob: Blob, filename: string) {
  try {
    await new Promise(resolve => {
      mkdir(RAW_DATA_ROOT_FOLDER, resolve);
    });
  } catch (e: unknown) {
    console.error(`creating directory ${RAW_DATA_ROOT_FOLDER}`, e);
  }

  const outputFilePath = RAW_DATA_ROOT_FOLDER + '/' + filename;
  try {
    blob.arrayBuffer().then(data => {
      const buffer = Buffer.from(data);
      writeFileSync(outputFilePath, buffer);
    })
  } catch (e: unknown) {
    console.error(`creating file ${outputFilePath}`, e);
  }
}
