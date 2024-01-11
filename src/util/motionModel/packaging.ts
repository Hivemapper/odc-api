import {
  API_VERSION,
  CAMERA_TYPE,
  METADATA_ROOT_FOLDER,
  UNPROCESSED_FRAMEKM_ROOT_FOLDER,
} from 'config';
import { existsSync, mkdirSync, promises, writeFileSync } from 'fs';
import { join } from 'path';
import { deleteFrameKm, getFrameKmName } from 'sqlite/framekm';
import { DetectionsByFrame, FrameKMTelemetry, FramesMetadata } from 'types/motionModel';
import { FrameKM, FrameKmRecord } from 'types/sqlite';
import { promiseWithTimeout, getQuality } from 'util/index';
import {
  MAX_PER_FRAME_BYTES,
  MIN_PER_FRAME_BYTES,
  concatFrames,
  getFrameKmTelemetry,
} from 'util/framekm';
import { Instrumentation } from 'util/instrumentation';
import { getDeviceInfo } from 'services/deviceInfo';
import { getConfig } from 'sqlite/config';

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

    const start = Date.now();
    const bytesMap = await promiseWithTimeout(
      concatFrames(
        frameKm.map((item: FrameKmRecord) => item.image_name || ''),
        finalBundleName,
        0,
        framesFolder
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

const CLASS_NAMES = ['face', 'person', 'license-plate', 'car', 'bus', 'truck', 'motorcycle', 'bicycle']

export const packMetadata = async (
  name: string,
  framesMetadata: FrameKM,
  bytesMap: { [key: string]: number },
): Promise<FramesMetadata[]> => {
  let numBytes = 0;
  const validatedFrames: FramesMetadata[] = [];
  let privacyModelHash = undefined;
  const privacyDetections: DetectionsByFrame = {};
  const metrics = {
    read_time: 0,
    write_time: 0,
    inference_time: 0,
    blur_time: 0,
  };

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
      if (m.ml_model_hash) {
        privacyModelHash = m.ml_model_hash;
        metrics.inference_time += m.ml_inference_time || 0;
        metrics.read_time += m.ml_read_time || 0;
        metrics.write_time += m.ml_write_time || 0;
        metrics.blur_time += m.ml_blur_time || 0;

        let detections = [];
        try {
          detections = JSON.parse(m.ml_detections || '[]');
        } catch (e: unknown) {
          console.log('Error parsing detections');
        }
        if (detections?.length) {
          const sanitizedDetections = detections.filter((d: any) => d && d.length === 3 && d[0].length === 4).map((d: any) => {
            let class_name = 'unknown';
            try {
              class_name = CLASS_NAMES[d[2]]
            } catch {
              //
            }
            return [
              class_name,
              Math.max(0, Math.floor(d[0][0])),
              Math.max(0, Math.floor(d[0][1])),
              Math.ceil(d[0][2]),
              Math.ceil(d[0][3]),
              d[1]
            ];
          });
          if (sanitizedDetections.length) {
            privacyDetections[validatedFrames.length] = sanitizedDetections;
          }
        }
      }
      numBytes += bytes;
    }
  }
  if (numBytes && validatedFrames.length > 2) {
    const deviceInfo = getDeviceInfo();
    const DX = await getConfig('DX');
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
        keyframeDistance: DX,
        resolution: '2k',
        version: '1.8',
        privacyModelHash,
        privacyDetections: privacyModelHash && Object.keys(privacyDetections).length ? JSON.stringify(privacyDetections) : undefined,
      },
      frames: validatedFrames,
    };
    if (privacyModelHash) {
      const firstFrame = framesMetadata[framesMetadata.length - 1];
      const lastFrame = framesMetadata[framesMetadata.length - 1];
      Instrumentation.add({
        event: 'DashcamML',
        size: validatedFrames.length,
        message: JSON.stringify({
          hash: privacyModelHash,
          inference_time: Math.round(metrics.inference_time / validatedFrames.length),
          read_time: Math.round(metrics.read_time / validatedFrames.length),
          write_time: Math.round(metrics.write_time / validatedFrames.length),
          blur_time: Math.round(metrics.blur_time / validatedFrames.length),
          avg_per_frame: Math.round((lastFrame.ml_processed_at || 0) - (firstFrame.ml_processed_at || 0)),
          processing_delay: Math.round((lastFrame.ml_processed_at || 0) - (lastFrame.created_at || 0))
        }),
      });
    }
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
