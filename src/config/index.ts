export * from './hdc';
export const API_VERSION = process.env.ODC_VERSION || '1.0.0';
export const FRAMEKM_VERSION = '1.10';

export const isDev = () => {
  return false;
};
