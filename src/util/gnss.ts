import { GnssRecord } from 'types/sqlite';
import { getConfig } from './motionModel/config';
import { GNSS } from 'types/motionModel';
import { timeIsMostLikelyLight } from './daylight';

export const isGoodQualityGnssRecord = (gnss: GnssRecord): boolean => {
  let isValid = true;

  if (!gnss.latitude) {
    return false;
  }

  for (const [key, value] of Object.entries(getConfig().GnssFilter)) {
    if (typeof value === 'number') {
      switch (key) {
        case '3dLock':
          isValid = isValid && gnss.fix === '3D';
          break;
        case 'minSatellites':
          isValid =
            isValid && !!gnss.satellites_used && gnss.satellites_used >= value;
          break;
        case 'xdop':
        case 'ydop':
        case 'pdop':
        case 'hdop':
        case 'vdop':
        case 'tdop':
        case 'gdop':
          isValid = isValid && gnss[key] <= value;
          break;
        case 'eph':
          isValid = isValid && !!gnss.eph && gnss.eph <= value;
          break;
        default:
          break;
      }
    }
  }
  return isValid;
};

export function isCarParkedBasedOnGnss(gpsData: GnssRecord[]) {
  return !gpsData.some((gps: GnssRecord) => gps.speed > 4);
}

export function isEnoughLightForGnss(gnss: GNSS | null) {
  if (!gnss || !gnss.timestamp || getConfig().isLightCheckDisabled) {
    return true;
  }
  return timeIsMostLikelyLight(
    new Date(gnss.timestamp),
    gnss.longitude,
    gnss.latitude,
  );
}