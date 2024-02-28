import {
  API_VERSION,
  CAMERA_TYPE,
  METADATA_ROOT_FOLDER,
  UNPROCESSED_FRAMEKM_ROOT_FOLDER,
} from 'config';
import { existsSync, mkdirSync, promises, writeFileSync } from 'fs';
import { join } from 'path';
import { deleteFrameKm, getFrameKmName } from 'sqlite/framekm';
import { FrameKMTelemetry, FramesMetadata } from 'types/motionModel';
import { FrameKM, FrameKmRecord } from 'types/sqlite';
import { promiseWithTimeout, getQuality } from 'util/index';
import {
  MAX_PER_FRAME_BYTES,
  MIN_PER_FRAME_BYTES,
  concatFrames,
  getFrameKmTelemetry,
} from 'util/framekm';
import { Instrumentation } from 'util/instrumentation';
import { getConfig } from './config';
import { getDeviceInfo } from 'services/deviceInfo';
import { getUsbState } from 'services/usbStateCheck';
import { getAnonymousID } from 'sqlite/deviceInfo';
import { fetchGnssAuthLogsByTime } from 'sqlite/gnss_auth';

export const packFrameKm = async (frameKm: FrameKM) => {
  console.log('Ready to pack ' + frameKm.length + ' frames');
  if (!frameKm.length) {
    return;
  }
  
  let finalBundleName;
  let frameKmName;
  try {
    const frameKmId = frameKm[0].fkm_id;
    frameKmName = await getFrameKmName(frameKmId);
    finalBundleName = frameKmName + '_' + frameKm.length + '_0';
    const framesFolder = join(
      UNPROCESSED_FRAMEKM_ROOT_FOLDER,
      String(frameKmId),
    );

    // We don't pack such a short framekms
    if (frameKm.length < 3) {
      console.log('SHORT FRAMEKM THROWN AWAY', frameKm.length);
      if (frameKm.length) {
        await deleteFrameKm(frameKm[0].fkm_id);
        await promises.rmdir(framesFolder, { recursive: true });
      }
      return;
    }
    // TODO: revisit when back to ML topic
    // if (!destFolder && getConfig().isDashcamMLEnabled) {
    //   destFolder = UNPROCESSED_FRAMEKM_ROOT_FOLDER + '/_' + bundleName + '_bundled';
    //   if (existsSync(destFolder)) {
    //     rmdirSync(destFolder, { recursive: true });
    //   }
    //   await new Promise(resolve => {
    //     mkdir(destFolder, resolve);
    //   });
    // }
    const start = Date.now();
    const bytesMap = await promiseWithTimeout(
      concatFrames(
        frameKm.map((item: FrameKmRecord) => item.image_name || ''),
        finalBundleName,
        0,
        framesFolder,
        false,
      ),
      15000,
    );
    let totalBytes = 0;
    if (bytesMap && Object.keys(bytesMap).length) {
      totalBytes = (Object.values(bytesMap) as number[]).reduce(
        (acc: number, curr: number | undefined) => acc + (Number(curr) || 0),
        0,
      );
      await promiseWithTimeout(
        packMetadata(finalBundleName, frameKm, bytesMap),
        5000,
      );

      let framekmTelemetry: FrameKMTelemetry = {
        systemtime: Date.now(),
      };
      try {
        framekmTelemetry = await promiseWithTimeout(
          getFrameKmTelemetry(framesFolder, frameKm),
          5000,
        );
      } catch (error: unknown) {
        console.log('Error getting telemetry', error);
      }
      Instrumentation.add({
        event: 'DashcamPackedFrameKm',
        size: totalBytes,
        message: JSON.stringify({
          name: finalBundleName,
          numFrames: frameKm?.length,
          duration: Date.now() - start,
          usbInserted: getUsbState(),
          ...framekmTelemetry,
        }),
      });
    }
    await deleteFrameKm(frameKm[0].fkm_id);
    await promises.rmdir(framesFolder, { recursive: true });
    
  } catch (error: unknown) {
    Instrumentation.add({
      event: 'DashcamFailedPackingFrameKm',
      message: JSON.stringify({
        name: finalBundleName || frameKmName,
        reason: 'Motion Model Error',
        error,
      }),
    });
    console.log(error);
  }
};

export const packMetadata = async (
  name: string,
  framesMetadata: FrameKM,
  bytesMap: { [key: string]: number },
): Promise<FramesMetadata[]> => {
  let numBytes = 0;
  const validatedFrames: FramesMetadata[] = [];
  for (let i = 0; i < framesMetadata.length; i++) {
    const m: FrameKmRecord = framesMetadata[i];
    const bytes = bytesMap[m.image_name || ''];
    if (bytes && bytes > MIN_PER_FRAME_BYTES && bytes < MAX_PER_FRAME_BYTES) {
      const frame: FramesMetadata = {
        bytes,
        lat: m.latitude,
        lon: m.longitude,
        alt: m.altitude,
        xdop: m.xdop,
        ydop: m.ydop,
        pdop: m.pdop,
        hdop: m.hdop,
        vdop: m.vdop,
        tdop: m.tdop,
        gdop: m.gdop,
        speed: m.speed * 3.6, // ms to kmh
        t: Math.round(m.time),
        satellites: Math.round(m.satellites_used),
        dilution: Math.round(m.dilution),
        eph: m.eph,
        acc_x: m.acc_x,
        acc_y: m.acc_y,
        acc_z: m.acc_z,
        gyro_x: m.gyro_x,
        gyro_y: m.gyro_y,
        gyro_z: m.gyro_z,
        // TODO: revisit with ML iteration
        // hash: m.ml_model_hash || '',
        // detections: m.ml_detections || '',
      };
      validatedFrames.push(frame);
      numBytes += bytes;
    }
  }
  if (numBytes) {
    const deviceInfo = getDeviceInfo();
    const deviceId = await getAnonymousID();

    const startTime = validatedFrames.at(0)?.t || Date.now();
    const endTime = validatedFrames.at(-1)?.t || Date.now();
    const gnssAuth = (await fetchGnssAuthLogsByTime(startTime, endTime, 1))[0];
    const metadataJSON = {
      bundle: {
        name,
        numFrames: validatedFrames.length,
        size: numBytes,
        deviceType: CAMERA_TYPE,
        quality: getQuality(),
        firmwareVersion: API_VERSION,
        ssid: deviceInfo?.ssid,
        loraDeviceId: undefined,
        keyframeDistance: getConfig().DX,
        resolution: '2k',
        version: '1.8',
        deviceId: deviceId,
        gnssAuthBuffer: gnssAuth?.buffer,
        gnssAuthBufferMessageNum: gnssAuth?.buffer_message_num,
        gnssAuthBufferHash: gnssAuth?.buffer_hash,
        gnssAuthSessionId: gnssAuth?.session_id,
        gnssAuthSignature: gnssAuth?.signature
      },
      frames: validatedFrames,
    };
    try {
      if (!existsSync(METADATA_ROOT_FOLDER)) {
        mkdirSync(METADATA_ROOT_FOLDER);
      }
      writeFileSync(
        METADATA_ROOT_FOLDER + '/' + name + '.json',
        JSON.stringify(metadataJSON),
        { encoding: 'utf-8' },
      );
      console.log('Metadata written for ' + name);
      return metadataJSON.frames;
    } catch (e: unknown) {
      console.log('Error writing Metadata file');
      return [];
    }
  } else {
    console.log('No bytes for: ' + name);
    return [];
  }
};
