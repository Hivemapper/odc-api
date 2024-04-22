import { GnssRecord } from 'types/sqlite';
import { GNSS, GnssFilter } from 'types/motionModel';
import { timeIsMostLikelyLight } from './daylight';
import { getConfig } from 'sqlite/config';

export const isGoodQualityGnssRecord = (gnss: GnssRecord, gnssFilter: GnssFilter): boolean => {
  let isValid = true;

  if ((!gnss.latitude && !gnss.longitude) || gnss.fix !== '3D') {
    return false;
  }

  for (const [key, value] of Object.entries(gnssFilter)) {
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

export async function isEnoughLightForGnss(gnss: GNSS | null) {
  const isLightCheckDisabled = await getConfig('isLightCheckDisabled');
  if (!gnss || !gnss.timestamp || isLightCheckDisabled) {
    return true;
  }
  return timeIsMostLikelyLight(
    new Date(gnss.timestamp),
    gnss.longitude,
    gnss.latitude,
  );
}