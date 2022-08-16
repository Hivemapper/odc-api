import { exec, execSync } from 'child_process';
import { Request, Response } from 'express';

export const PORT = 5000;
export const PUBLIC_FOLDER = __dirname + '/../../../tmp/recording';
export const FRAMES_ROOT_FOLDER = __dirname + '/../../../tmp/recording/pic';
export const GPS_ROOT_FOLDER = __dirname + '/../../../tmp/recording/gps';
export const IMU_ROOT_FOLDER = __dirname + '/../../../tmp/recording/imu';
export const LORA_ROOT_FOLDER = __dirname + '/../../../tmp/recording/lora';
export const BUILD_INFO_PATH = __dirname + '/../../../etc/version.json';
export const LED_CONFIG_PATH = __dirname + '/../../../tmp/led.json';
export const IMAGER_CONFIG_PATH =
  __dirname + '/../../../opt/dashcam/bin/config.json';
export const UPLOAD_PATH = __dirname + '/../../../tmp/';

export const configureOnBoot = async (req: Request, res: Response) => {
  try {
    const timeToSet = new Date(Number(req.query.time))
      .toISOString()
      .replace(/T/, ' ')
      .replace(/\..+/, '')
      .split(' ');

    // setting up initial time for camera
    exec('timedatectl set-ntp 0', () => {
      exec(`timedatectl set-time ${timeToSet[0]}`, () => {
        exec(`timedatectl set-time ${timeToSet[1]}`, () => {
          // make sure that camera started when the App is connected
          exec('systemctl start camera-bridge');
        });
      });
    });

    res.json({
      output: 'done',
    });
  } catch (error) {
    res.json({ error });
  }
};

export const updateFirmware = async (req: Request, res: Response) => {
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
