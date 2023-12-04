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

export type RawLogsConfiguration = {
  isEnabled: boolean;
  interval: number; // if 0, will fire for every FrameKM
  snapshotSize: 30, // will take last N seconds, if 0 - will match with FrameKM start-end
  includeGps: true // whether to include GPS or not, true is default
  includeImu: true // whether to include IMU or not, true is default
  maxCollectedBytes: 5000000 // in bytes, default is 50 mgs
}

export type MotionModelConfig = {
  DX: number;
  GnssFilter: {
    hdop?: number;
    gdop?: number;
    pdop?: number;
    cep?: number;
    '3dLock': boolean;
    minSatellites: number;
    eph?: number;
  };
  Privacy: {
    numThreads?: number,
    confThreshold?: number,
    iouThreshold?: number,
  }
  ImuFilter: {
    threshold: number;
    alpha: number;
    params: number[];
  };
  MaxPendingTime: number;
  isImuMovementDetectionEnabled: boolean;
  isCornerDetectionEnabled: boolean;
  isLightCheckDisabled: boolean;
  isTripTrimmingEnabled: boolean;
  TrimDistance: number;
  FrameKmLengthMeters: number;
  isDashcamMLEnabled: boolean;
  isGyroCalibrationEnabled: boolean;
  isAccelerometerCalibrationEnabled: boolean;
  rawLogsConfiguration: RawLogsConfiguration;
  privacyRadius?: number;
  modelHashes?: Record<string, string>;
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

export type LatLon = { latitude: number; longitude: number };

export type GnssMetadata = Dilution & {
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  t: number;
  systemTime?: number;
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

export type DiskUsage = {
  gps?: number;
  frameKm?: number;
  imu?: number;
  metadata?: number;
  ml?: number;
  pic?: number;
  total?: number;
}

export type FrameKMTelemetry = {
  systemtime: number;
  width?: number;
  height?: number;
  lat?: number;
  lon?: number;
  accel_x?: number;
  accel_y?: number;
  accel_z?: number;
  gyro_x?: number;
  gyro_y?: number;
  gyro_z?: number;
  disk_used?: DiskUsage;
}