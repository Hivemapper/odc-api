import { exec, execSync } from 'child_process';
import { Request, Response } from 'express';

export const PORT = 5000;

export const PUBLIC_FOLDER = __dirname + '/../../../tmp/recording';
export const FRAMES_ROOT_FOLDER = __dirname + '/../../../tmp/recording/pic';
export const GPS_ROOT_FOLDER = __dirname + '/../../../tmp/recording/gps';
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

export const stopCamera = () => {
  exec('command to stop the camera recordings');
};

export const startCamera = () => {
  exec('command to start the camera');
};

export const configureOnBoot = async (req: Request, res: Response) => {
  // If anything needs to be done on load for HDC-S
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

export const switchToP2P = async (req: Request, res: Response) => {
  // execute command on camera to switch to P2P mode
  // Placeholder
};

export const switchToAP = async (req: Request, res: Response) => {
  // execute command on camera to switch to AP mode
  // Placeholder
};

export const updateCameraConfig = () => {
  // Placeholder
};
