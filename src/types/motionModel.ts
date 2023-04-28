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
};

export type GnssMetadata = Dilution & {
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  t: number;
  systemTime: number;
  satellites: number;
  dilution: number;
};

export type ImuMetadata = {
  accelerometer?: IXYZPoint[];
  magnetometer?: IXYZPoint[];
  gyroscope?: IXYZPoint[];
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
