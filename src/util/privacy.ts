import KDBush from 'kdbush';
import { latLonToWebMercator } from './geomath';
import { getConfig } from './motionModel/config';

const DEFAULT_RADIUS = 200;
let privateZones: KDBush | undefined;

export const isPrivateLocation = (lat: number, lon: number): boolean => {
  if (!lat || !lon) {
    return false;
  }
  const config = getConfig();
  const { x, y } = latLonToWebMercator(lat, lon);
  const radius = config?.privacyRadius || DEFAULT_RADIUS;
  return privateZones ? !!privateZones.within(x, y, radius * 1.25).length : false;
}

export const setPrivateZones = (points: [number, number][]) => {
  privateZones = new KDBush(points.length);

  for (const point of points) {
    const [lon, lat] = point;
    const { x, y } = latLonToWebMercator(lat, lon);
    privateZones.add(x, y);
  }
  privateZones.finish();
}