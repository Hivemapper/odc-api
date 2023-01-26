import { execSync } from 'child_process';
import { Request, Response } from 'express';
import { CameraType } from 'types';

export const PORT = 5000;

export const PUBLIC_FOLDER = __dirname + '/../../../data/recording';
export const FRAMES_ROOT_FOLDER = __dirname + '/../../../data/recording/pic';
export const FRAMEKM_ROOT_FOLDER =
  __dirname + '/../../../data/recording/framekm';
export const STREAM_REQUEST_FOLDER =
  __dirname + '/../../../data/recording/request';
export const GPS_ROOT_FOLDER = __dirname + '/../../../data/recording/gps';
export const GPS_LATEST_SAMPLE =
  __dirname + '/../../../data/recording/gps/latest.log';
export const IMU_ROOT_FOLDER = __dirname + '/../../../data/recording/imu';
export const LORA_RESPONSE_FOLDER = __dirname + '/../../../data/lorawan';
export const LORA_REQUEST_FOLDER = __dirname + '/../../../tmp/lorawan';
export const BUILD_INFO_PATH = __dirname + '/../../../etc/version.json';
export const WEBSERVER_LOG_PATH =
  __dirname + '/../../../data/recording/camera-node.log';
export const LED_CONFIG_PATH = __dirname + '/../../../tmp/led.json';
// File containing the camera configuration
export const IMAGER_CONFIG_PATH =
  __dirname + '/../../../opt/camera-bridge/config.json';
// Path that will be used by the App to upload the new firmware image
export const UPLOAD_PATH = __dirname + '/../../../data/';
export const DEVICE_INFO_LOG_FILE = __dirname + '/../../../tmp/dump.bin';
export const CRON_CONFIG = '/home/root/cron_config';
export const CRON_EXECUTED_TASKS_PATH = '/home/root/cron_executed';
export const IMAGER_BRIDGE_PATH =
  __dirname + '/../../../opt/dashcam/bin/bridge.sh';
export const PREVIEW_ROUTE = ':9001/?action=stream';
export const MAX_DOWNLOAD_DEBT = 1073741824; // 1GB for now

export const CAMERA_TYPE: CameraType = CameraType.HdcS;

export const CMD = {
  START_CAMERA: 'systemctl start camera-bridge',
  STOP_CAMERA: 'systemctl stop camera-bridge',
  START_PREVIEW: 'systemctl start camera-preview',
  STOP_PREVIEW: 'systemctl stop camera-preview',
  READ_DEVICE_INFO:
    '/opt/dashcam/bin/eeprom_access.py -r -f /tmp/dump.bin -o 0 -l 30',
};

export const configureOnBoot = async (req: Request, res: Response) => {
  // If anything needs to be done on boot for HDC-S
  // Placeholder
  res.json({
    output: 'done',
  });
};

export const updateFirmware = async (req: Request, res: Response) => {
  // Execute utility to update the firmware using the image file that was uploaded to /tmp/<new firmware image file>
  try {
    const output = execSync('mender -install /data/' + req.query.filename, {
      encoding: 'utf-8',
    });
    res.json({
      output,
    });
  } catch (error: any) {
    res.json({ error: error.stdout || error.stderr });
  }
};
