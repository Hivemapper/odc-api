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

export type GnssFilter = {
  hdop?: number;
  gdop?: number;
  pdop?: number;
  cep?: number;
  '3dLock': boolean;
  minSatellites: number;
  eph?: number;
}
export type SystemConfig = {
  DX: number;
  GnssFilter: GnssFilter;
  Privacy: {
    numThreads?: number,
    confThreshold?: number,
    iouThreshold?: number,
  }
  MaxPendingTime: number;
  isCornerDetectionEnabled: boolean;
  isLightCheckDisabled: boolean;
  isTripTrimmingEnabled: boolean;
  TrimDistance: number;
  lastTrimmed: number;
  lastTimeIterated: number;
  FrameKmLengthMeters: number;
  isDashcamMLEnabled: boolean;
  isGyroCalibrationEnabled: boolean;
  isAccelerometerCalibrationEnabled: boolean;
  privacyRadius?: number;
  modelHashes?: Record<string, string>;
  PrivacyModelPath?: string;
  PrivacyModelHash?: string;
  PrivacyConfThreshold?: number;
  PrivacyNmsThreshold?: number;
  PrivacyNumThreads?: number;
  SpeedToIncreaseDx?: number;
  HdcSwappiness?: number;
  HdcsSwappiness?: number;
  isProcessingEnabled?: boolean;
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

export type DetectionsData = [string, number, number, number, number, number];

export type DetectionsByFrame = Record<string, DetectionsData[]>;

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