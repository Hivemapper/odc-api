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
  log: boolean;
}

export interface ICronJob {
  config: ICronJobConfig;
  start: () => void;
  stop: () => void;
}
