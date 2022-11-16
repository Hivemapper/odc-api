import { exec, execSync, ExecException } from 'child_process';
import { Request, Response } from 'express';
import { writeFile } from 'fs';
import { CameraType } from 'types';

export const PORT = 5000;

export const PUBLIC_FOLDER = __dirname + '/../../../mnt/data';
export const FRAMES_ROOT_FOLDER = __dirname + '/../../../mnt/data/pic';
export const FRAMEKM_ROOT_FOLDER = __dirname + '/../../../mnt/data/framekm';
export const GPS_ROOT_FOLDER = __dirname + '/../../../mnt/data/gps';
export const GPS_LATEST_SAMPLE =
  __dirname + '/../../../mnt/data/gps/latest.log';
export const IMU_ROOT_FOLDER = __dirname + '/../../../mnt/data/imu';
export const LORA_ROOT_FOLDER = __dirname + '/../../../mnt/data/lora';
export const BUILD_INFO_PATH = __dirname + '/../../../etc/version.json';
export const WEBSERVER_LOG_PATH =
  __dirname + '/../../../mnt/data/camera-node.log';
export const LED_CONFIG_PATH = __dirname + '/../../../tmp/led.json';
export const IMAGER_CONFIG_PATH =
  __dirname + '/../../../opt/dashcam/bin/config.json';
export const IMAGER_BRIDGE_PATH =
  __dirname + '/../../../opt/dashcam/bin/bridge.sh';
export const UPLOAD_PATH = __dirname + '/../../../tmp/';
export const NETWORK_BOOT_CONFIG_PATH =
  __dirname + '/../../../mnt/data/network_mode.txt';
export const DEVICE_INFO_LOG_FILE = __dirname + '/../../../tmp/dump.bin';
export const CRON_CONFIG = '/mnt/data/cron_config';
export const CRON_EXECUTED_TASKS_PATH = '/mnt/data/cron_executed';
export const PREVIEW_ROUTE = ':9001/?action=stream';

export const CAMERA_TYPE: CameraType = CameraType.Hdc;

export const CMD = {
  START_CAMERA: 'systemctl start camera-bridge',
  STOP_CAMERA: 'systemctl stop camera-bridge',
  START_PREVIEW: 'systemctl start camera-preview',
  STOP_PREVIEW: 'systemctl stop camera-preview',
  READ_DEVICE_INFO:
    'sh /opt/dashcam/bin/eeprom_access.sh -r -f /tmp/dump.bin -o 0 -ba 0 -s',
};

export const configureOnBoot = async (req: Request, res: Response) => {
  try {
    // USE FOR PASSING INITIAL CONFIGURATION
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

export const switchToP2P = async (req: Request, res: Response) => {
  try {
    // No need to wait for response — it's tearing down current Network method, so it will kill the connection anyways
    exec(__dirname + '/network/test_P2Pconnect_any.sh');
    try {
      writeFile(NETWORK_BOOT_CONFIG_PATH, 'P2P', null, () => {});
    } catch (e: unknown) {
      console.log(e);
    }
    res.json({
      output: 'done',
    });
  } catch (error: any) {
    res.json({ error: error.stdout || error.stderr });
  }
};

export const switchToAP = async (req: Request, res: Response) => {
  try {
    exec(__dirname + '/network/wifi_switch_AP.sh');
    try {
      writeFile(NETWORK_BOOT_CONFIG_PATH, 'AP', null, () => {});
    } catch (e: unknown) {
      console.log(e);
    }
    res.json({
      output: 'done',
    });
  } catch (error: any) {
    res.json({ error: error.stdout || error.stderr });
  }
};
