import { execSync } from 'child_process';
import { Request, Response } from 'express';
import { CameraType } from 'types';

export const PORT = 5005;

export const PUBLIC_FOLDER = '../end-to-end-test/mnt/data';
export const TMP_PUBLIC_FOLDER = '../end-to-end-test/tmp/recording';
export const FRAMES_ROOT_FOLDER = '../end-to-end-test/tmp/recording/pic';
export const FRAMEKM_ROOT_FOLDER = '../end-to-end-test/mnt/data/framekm';
export const UNPROCESSED_FRAMEKM_ROOT_FOLDER = '../end-to-end-test/mnt/data/unprocessed_framekm';
export const RAW_DATA_ROOT_FOLDER = '../end-to-end-test/mnt/data/raw';
export const STREAM_REQUEST_FOLDER = '../end-to-end-test/mnt/data/request';
export const DB_PATH = '../end-to-end-test/mnt/data/data-logger.v1.4.5.db';
export const GPS_ROOT_FOLDER = '../end-to-end-test/mnt/data/gps';
export const BACKUP_FRAMES_ROOT_FOLDER = '../end-to-end-test/mnt/data/frames';
export const GPS_MGA_OFFLINE_FILE = '../end-to-end-test/mnt/data/mgaoffline.ubx';
export const GPS_MGA_OFFLINE_HASH = '../end-to-end-test/mnt/data/mgaoffline.hash';
export const METADATA_ROOT_FOLDER = '../end-to-end-test/mnt/data/metadata';
export const ML_METADATA_ROOT_FOLDER = '../end-to-end-test/mnt/data/ml_metadata';
export const UNPROCESSED_METADATA_ROOT_FOLDER = '../end-to-end-test/mnt/data/unprocessed_metadata';
export const ML_SCRIPT_PATH = '/opt/dashcam/bin/ml/privacy.py';
export const DEFAULT_MODEL_PATH = '/opt/dashcam/bin/ml';
export const GPS_LATEST_SAMPLE =
  '../end-to-end-test/mnt/data/gps/latest.log';
export const IMU_ROOT_FOLDER = '../end-to-end-test/mnt/data/imu';
export const ML_ROOT_FOLDER = '../end-to-end-test/mnt/data/models';
export const LORA_RESPONSE_FOLDER = '../end-to-end-test/mnt/data/lorawan';
export const LORA_REQUEST_FOLDER = '/tmp/lorawan';
export const USB_WRITE_PATH = '/media/usb0/recording';
export const BUILD_INFO_PATH = '/etc/version.json';
export const ACL_TOOL_PATH = '/opt/dashcam/bin/acl';
export const FRAMEKM_CLEANUP_SCRIPT = '/opt/dashcam/bin/cleanup_framekm.sh';
export const DATA_INTEGRITY_SCRIPT = '/opt/dashcam/bin/data_integrity_check.sh';
export const FIRMWARE_UPDATE_MARKER = '../end-to-end-test/mnt/data/update_in_progress';
export const ACL_FILES_PATH = '../end-to-end-test/mnt/data';
export const WEBSERVER_LOG_PATH =
  '../end-to-end-test/mnt/data/camera-node.log';
export const EVENTS_LOG_PATH = '../end-to-end-test/mnt/data/events.log';
export const LED_CONFIG_PATH = '/tmp/led.json';
export const IMU_CALIBRATOR_PATH = '/opt/dashcam/bin/imucalibrator';
export const CACHED_CAMERA_CONFIG = '../end-to-end-test/mnt/data/camera.conf';
export const PRIVACY_ZONES_CONFIG = '../end-to-end-test/mnt/data/ppz.json';
export const MOTION_MODEL_CURSOR = '../end-to-end-test/mnt/data/mm_cursor.log';
export const MOTION_MODEL_CONFIG = '../end-to-end-test/mnt/data/dashcam_config.json';
export const IMAGER_CONFIG_PATH =
  '/opt/dashcam/bin/config.json';
export const NEW_IMAGER_CONFIG_PATH =
  '/opt/dashcam/bin/camera_config.json';
export const CACHED_RES_CONFIG = '../end-to-end-test/mnt/data/res.conf';
export const IMAGER_BRIDGE_PATH =
  '/opt/dashcam/bin/bridge.sh';
export const UPLOAD_PATH = '../end-to-end-test/mnt/data/';
export const NETWORK_BOOT_CONFIG_PATH =
  '../end-to-end-test/mnt/data/wifi.cfg';
export const DEVICE_INFO_LOG_FILE = '/tmp/dump.bin';
export const CRON_CONFIG = '../end-to-end-test/mnt/data/cron_config';
export const ML_MODEL_PATH = '/opt/dashcam/bin/n640_float16.tflite';
export const ML_MODELS: Record<string, string> = {
  PVC: '../end-to-end-test/mnt/data/pvc.onnx'
}
export const HEALTH_MARKER_PATH = '../end-to-end-test/mnt/data/healthy.txt';
export const CRON_EXECUTED_TASKS_PATH = '../end-to-end-test/mnt/data/cron_executed';
export const DATA_LOGGER_SERVICE = 'data-logger';
export const FOLDER_PURGER_SERVICE = 'folder_purger';
export const CAMERA_TYPE: CameraType = CameraType.Hdc;
export const CAMERA_BRIDGE_CONFIG_FILE_OVERRIDE =
  '../end-to-end-test/mnt/data/camera_bridge_config.json';
export const CAMERA_BRIDGE_CONFIG_FILE_HASH =
  '../end-to-end-test/mnt/data/camera_bridge_config.hash';

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
