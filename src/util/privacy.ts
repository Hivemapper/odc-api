import KDBush from 'kdbush';
import { latLonToWebMercator } from './geomath';
import { getConfig } from 'sqlite/config';

const DEFAULT_RADIUS = 200;
let privateZones: KDBush | undefined;

export const isPrivateLocation = async (lat: number, lon: number): Promise<boolean> => {
  if (!lat || !lon) {
    return false;
  }
  const { privacyRadius } = await getConfig('privacyRadius');
  const { x, y } = latLonToWebMercator(lat, lon);
  const radius = privacyRadius || DEFAULT_RADIUS;
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