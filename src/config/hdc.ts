import { execSync } from 'child_process';
import { Request, Response } from 'express';
import { CameraType } from 'types';

export const PORT = 5000;

export const PUBLIC_FOLDER = '/mnt/data';
export const TMP_PUBLIC_FOLDER = '/tmp/recording';
export const FRAMES_ROOT_FOLDER = '/tmp/recording/pic';
export const FRAMEKM_ROOT_FOLDER = '/mnt/data/framekm';
export const RAW_DATA_ROOT_FOLDER = '/mnt/data/raw';
export const STREAM_REQUEST_FOLDER = '/mnt/data/request';
export const GPS_ROOT_FOLDER = '/mnt/data/gps';
export const GPS_MGA_OFFLINE_FILE = '/mnt/data/mgaoffline.ubx';
export const GPS_MGA_OFFLINE_HASH = '/mnt/data/mgaoffline.hash';
export const METADATA_ROOT_FOLDER = '/mnt/data/metadata';
export const GPS_LATEST_SAMPLE =
  '/mnt/data/gps/latest.log';
export const IMU_ROOT_FOLDER = '/mnt/data/imu';
export const LORA_RESPONSE_FOLDER = '/mnt/data/lorawan';
export const LORA_REQUEST_FOLDER = '/tmp/lorawan';
export const BUILD_INFO_PATH = '/etc/version.json';
export const ACL_TOOL_PATH = '/opt/dashcam/bin/acl';
export const FRAMEKM_CLEANUP_SCRIPT = '/opt/dashcam/bin/cleanup_framekm.sh';
export const DATA_INTEGRITY_SCRIPT = '/opt/dashcam/bin/data_integrity_check.sh';
export const ACL_FILES_PATH = '/mnt/data';
export const WEBSERVER_LOG_PATH =
  '/mnt/data/camera-node.log';
export const LED_CONFIG_PATH = '/tmp/led.json';
export const CACHED_CAMERA_CONFIG = '/mnt/data/camera.conf';
export const MOTION_MODEL_CURSOR = '/mnt/data/mm_cursor.log';
export const MOTION_MODEL_CONFIG = '/mnt/data/dashcam_config.json';
export const IMAGER_CONFIG_PATH =
  '/opt/dashcam/bin/config.json';
export const NEW_IMAGER_CONFIG_PATH =
  '/opt/dashcam/bin/camera_config.json';
export const CACHED_RES_CONFIG = '/mnt/data/res.conf';
export const IMAGER_BRIDGE_PATH =
  '/opt/dashcam/bin/bridge.sh';
export const UPLOAD_PATH = '/tmp/';
export const NETWORK_BOOT_CONFIG_PATH =
  '/mnt/data/wifi.cfg';
export const DEVICE_INFO_LOG_FILE = '/tmp/dump.bin';
export const CRON_CONFIG = '/mnt/data/cron_config';
export const HEALTH_MARKER_PATH = '/mnt/data/healthy.txt';
export const CRON_EXECUTED_TASKS_PATH = '/mnt/data/cron_executed';
export const DATA_LOGGER_SERVICE = 'data-logger';

export const CAMERA_TYPE: CameraType = CameraType.Hdc;
export const CAMERA_BRIDGE_CONFIG_FILE_OVERRIDE =
  '/mnt/data/camera_bridge_config.json';
export const CAMERA_BRIDGE_CONFIG_FILE_HASH =
  '/mnt/data/camera_bridge_config.hash';

export const CMD = {
  RESTART_CAMERA: 'systemctl restart camera-bridge',
  START_CAMERA: 'systemctl start camera-bridge',
  STOP_CAMERA: 'systemctl stop camera-bridge',
  READ_DEVICE_INFO:
    '/opt/dashcam/bin/eeprom_access.py -r -f /tmp/dump.bin -o 0 -ba 0 -l 30',
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
