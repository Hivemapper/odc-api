import { execSync } from 'child_process';
import { Request, Response } from 'express';

export const PORT = 5000;

export const PUBLIC_FOLDER = __dirname + '/../../../tmp/recording';
export const FRAMES_ROOT_FOLDER = __dirname + '/../../../tmp/recording/pic';
export const FRAMEKM_ROOT_FOLDER =
  __dirname + '/../../../tmp/recording/framekm';
export const GPS_ROOT_FOLDER = __dirname + '/../../../tmp/recording/gps';
export const GPS_LATEST_SAMPLE =
  __dirname + '/../../../tmp/recording/gps/latest.log';
export const IMU_ROOT_FOLDER = __dirname + '/../../../tmp/recording/imu';
export const LORA_ROOT_FOLDER = __dirname + '/../../../tmp/recording/lora';
export const BUILD_INFO_PATH = __dirname + '/../../../etc/version.json';
export const WEBSERVER_LOG_PATH =
  __dirname + '/../../../mnt/data/camera-node.log';
export const LED_CONFIG_PATH = __dirname + '/../../../tmp/led.json';
// File containing the camera configuration
export const IMAGER_CONFIG_PATH =
  __dirname + '/../../../opt/dashcam/bin/config.json';
// Path that will be used by the App to upload the new firmware image
export const UPLOAD_PATH = __dirname + '/../../../tmp/';
export const DEVICE_INFO_LOG_FILE = __dirname + '/../../../tmp/dump.bin';

export const CMD = {
  START_CAMERA: 'systemctl start camera-bridge',
  STOP_CAMERA: 'systemctl stop camera-bridge',
  START_PREVIEW: 'systemctl start camera-preview',
  STOP_PREVIEW: 'systemctl stop camera-preview',
  READ_DEVICE_INFO:
    'sh /opt/dashcam/bin/eeprom_access.sh -r -f /tmp/dump.bin -o 0 -ba 0 -s',
};

export const getImageQuality = () => {
  // TBD
  // Return number between 0 to 100 that is used for configuring the imager quality
  return 70;
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
    const output = execSync('rauc install /tmp/' + req.query.filename, {
      encoding: 'utf-8',
    });
    res.json({
      output,
    });
  } catch (error: any) {
    res.json({ error: error.stdout || error.stderr });
  }
};
