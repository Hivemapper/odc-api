export interface ImuRecord {
    id: number;
    time: string;
    acc_x: number;
    acc_y: number;
    acc_z: number;
    gyro_x: number;
    gyro_y: number;
    gyro_z: number;
    temperature: number;
}

export interface GnssRecord {
    id: number;
    time: string;
    system_time: string;
    fix: string;
    ttff: number;
    latitude: number;
    longitude: number;
    altitude: number;
    speed: number;
    heading: number;
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