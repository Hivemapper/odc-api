import { SystemConfig } from './motionModel';
import { GnssRecord, ImuRecord } from './sqlite';

export enum CameraType {
  Hdc = 'hdc',
  HdcS = 'hdc-s',
}

export interface ICameraFile {
  path: string;
  date: number;
  size?: number;
}

export interface ILED {
  index?: number;
  red: number;
  green: number;
  blue: number;
  on: boolean;
}

export interface IService {
  execute: () => void;
  interval?: number;
  delay?: number;
}

export interface DeviceInfo {
  serial: string;
  boardConfig: string;
  ssid: string;
}

export interface GNSS {
  timestamp: string;
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  speed: number;
  ecef: {
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
}

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

export interface IImage {
  system_time: number;
  image_name: string;
}

export type SensorData = ImuRecord | GnssRecord | IImage;

export interface ICronJobFrequency {
  interval?: number;
  delay?: number;
  oncePerDevice?: boolean;
  executeOnce?: boolean;
}

export type ICronConditionMethod =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'greaterThan'
  | 'lessThan';

export interface ICronJobCondition {
  cmd: string;
  method: ICronConditionMethod;
  value: string | number;
  and?: ICronJobCondition;
  or?: ICronJobCondition;
}

export interface ICronJobConfig {
  id: string;
  cmd: string | string[];
  if: ICronJobCondition;
  frequency: ICronJobFrequency;
  device?: CameraType;
  firmware?: string;
  timeout?: number;
  value?: number;
  flags?: SystemConfig;
  log: boolean;
}

export interface ICronJob {
  config: ICronJobConfig;
  start: () => void;
  stop: () => void;
}

export interface ICameraConfig {
  recording: {
    directory: {
      prefix: string;
      output: string;
      minfreespace: number;
      output2: string;
      minfreespace2: number;
      maxusedspace: number;
      downsampleStreamDir?: string;
    };
  };
  camera: {
    encoding: {
      fps: number;
      width: number;
      height: number;
      codec: string;
      quality?: number;
      qualityDwn?: number;
    };
    adjustment: {
      hflip: boolean;
      vflip: boolean;
      denoise?: string;
      rotation: number;
    };
  };
}

export interface BoundingBox2D {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export type CameraResolution = '2K' | '4K';

export interface InstrumentationData {
  event: string;
  size?: number;
  start?: number;
  end?: number;
  timestamp?: number;
  session?: string;
  usedMemory?: number;
  message?: string;
}

export interface IServiceRestart {
  objectDetection?: boolean;
  dataLogger?: boolean;
  cameraBridge?: boolean;
}
