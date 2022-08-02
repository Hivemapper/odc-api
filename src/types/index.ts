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
}
