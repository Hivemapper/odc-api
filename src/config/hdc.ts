import { execSync } from 'child_process';
import { Request, Response } from 'express';

export const PORT = 5000;
export const FRAMES_ROOT_FOLDER = __dirname + '/../../../tmp/recording';
export const GPS_ROOT_FOLDER = __dirname + '/../../../tmp/recording/gps';
export const IMU_ROOT_FOLDER = __dirname + '/../../../tmp/recording/imu';
export const LORA_ROOT_FOLDER = __dirname + '/../../../tmp/recording/lora';
export const BUILD_INFO_PATH = __dirname + '/../../../etc/version.json';

export const configureOnBoot = async (req: Request, res: Response) => {
  try {
    const timeToSet = new Date(Number(req.query.time))
      .toISOString()
      .replace(/T/, ' ')
      .replace(/\..+/, '')
      .split(' ');

    // setting up initial time for camera
    await execSync('timedatectl set-ntp 0');
    await execSync(`timedatectl set-time ${timeToSet[0]}`);
    await execSync(`timedatectl set-time ${timeToSet[1]}`);
    // stop the camera to get a solid GPS lock
    await execSync(`systemctl stop camera-bridge`);

    res.json({
      output: 'done',
    });
  } catch (error) {
    res.json({ error });
  }
};
