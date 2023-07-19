import { ICameraFile } from 'types';

export type Dilution = {
  xdop: number;
  ydop: number;
  pdop: number;
  hdop: number;
  vdop: number;
  tdop: number;
  gdop: number;
};

export type FrameKMOutput = {
  chunkName: string;
  metadata: FramesMetadata[];
  images: ICameraFile[];
};

export type MotionModelConfig = {
  DX: number;
  GnssFilter: {
    hdop?: number;
    pdop?: number;
    cep?: number;
    '3dLock': boolean;
    minSatellites: number;
    eph?: number;
  };
  ImuFilter: {
    threshold: number;
    alpha: number;
    params: number[];
  };
  MaxPendingTime: number;
  isImuMovementDetectionEnabled: boolean;
  isCornerDetectionEnabled: boolean;
  isLightCheckDisabled: boolean;
  isRawImuAndGnssFetchDisabled: boolean;
  RawImuAndGnssIntervalTime: number;
};

export type GNSS = {
  timestamp: string;
  systemtime: string;
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  speed: number;
  ecef?: {
    velocity: [number, number, number];
    velocityAccel: number;
    position: [number, number, number];
    positionAccel: number;
  };
  satellites: {
    seen: number;
    used: number;
  };
  fix: string;
  dilution?: number;
  // flags: [number, number, number];
  dop?: Dilution;
  eph?: number;
};

export interface IMU {
  accel: {
    x: number;
    y: number;
    z: number;
  };
  gyro: {
    x: number;
    y: number;
    z: number;
  };
  temp: number;
  time: string;
}

export type GnssMetadata = Dilution & {
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  t: number;
  systemTime: number;
  satellites: number;
  dilution: number;
  eph: number;
};

export type ImuMetadata = {
  accelerometer: IXYZPoint[];
  magnetometer: IXYZPoint[];
  gyroscope: IXYZPoint[];
};

export interface IXYZPoint {
  ts: number;
  x: number;
  y: number;
  z: number;
}

export type CurveData = {
  lat: number;
  lon: number;
  alt: number;
  v: number;
};

export type FramesMetadata = GnssMetadata & {
  frameKm?: string;
  bytes?: number;
  name?: string;
  acc_x: number;
  acc_y: number;
  acc_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
};

export type MotionModelCursor = {
  gnssFilePath: string;
  imuFilePath: string;
};
