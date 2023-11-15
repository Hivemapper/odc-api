// @ts-nocheck
import { SensorData } from 'types';

export const isGnss = (data: SensorData): boolean => {
    return data.latitude !== undefined;
}

export const isImu = (data: SensorData): boolean => {
    return data.acc_x !== undefined;
}

export const isImage = (data: SensorData): boolean => {
    return data.image_name !== undefined;
}