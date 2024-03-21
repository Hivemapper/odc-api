export interface ImuRecord {
    id: number;
    time: number;
    system_time: number;
    acc_x: number;
    acc_y: number;
    acc_z: number;
    gyro_x: number;
    gyro_y: number;
    gyro_z: number;
    temperature: number;
}

export interface GnssRecord {
    time: number;
    system_time: number;
    fix: string;
    ttff: number;
    latitude: number;
    longitude: number;
    altitude: number;
    speed: number;
    heading: number;
    dilution: number;
    satellites_seen: number;
    satellites_used: number;
    eph: number;
    horizontal_accuracy: number;
    vertical_accuracy: number;
    heading_accuracy: number;
    speed_accuracy: number;
    hdop: number;
    vdop: number;
    xdop: number;
    ydop: number;
    tdop: number;
    pdop: number;
    gdop: number;
    rf_jamming_state: string;
    rf_ant_status: string;
    rf_ant_power: string;
    rf_post_status: number;
    rf_noise_per_ms: number;
    rf_agc_cnt: number;
    rf_jam_ind: number;
    rf_ofs_i: number;
    rf_mag_i: number;
    rf_ofs_q: number;
    gga: string;
    rxm_measx: string;
}

export interface GnssAuthRecord {
  id: number;
  buffer: string;
  buffer_message_num: number;
  buffer_hash: string;
  session_id: string;
  signature: string;
  system_time: number;
}

export type FrameKmRecord = {
    fkm_id?: number;
    image_name: string;
    image_path?: string;
    acc_x: number;
    acc_y: number;
    acc_z: number;
    gyro_x: number;
    gyro_y: number;
    gyro_z: number;
    xdop: number;
    ydop: number;
    tdop: number;
    vdop: number;
    pdop: number;
    gdop: number;
    hdop: number;
    eph: number;
    latitude: number;
    longitude: number;
    altitude: number;
    speed: number;
    time: number;
    system_time: number;
    satellites_used: number;
    dilution: number;
    created_at?: number;
    ml_model_hash?: string;
    ml_detections?: string;
    ml_read_time?: number;
    ml_write_time?: number;
    ml_blur_time?: number;
    ml_inference_time?: number;
    ml_processed_at?: number;
    ml_downscale_time?: number;
    ml_upscale_time?: number;
    ml_mask_time?: number;
    ml_composite_time?: number;
    ml_load_time?: number;
    ml_transpose_time?: number;
    ml_letterbox_time?: number;
    frame_idx?: number;
    postponed?: number;
    error?: string;
  };

  export type ErrorRecord = {
    system_time: number;
    service_name: string;
    message: string;
  }

  export type FrameKM = FrameKmRecord[];
  
  export type SensorRecord = (GnssRecord | ImuRecord) & {sensor: string, device_id: string};