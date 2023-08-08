import KDBush from 'kdbush';
import { latLonToWebMercator } from './geomath';
import { getConfig } from './motionModel';

const DEFAULT_RADIUS = 50;
let privateZones: KDBush | undefined;

export const isPrivateLocation = (lat: number, lon: number): boolean => {
    const config = getConfig();
    const { x, y } = latLonToWebMercator(lat, lon);
    return privateZones ? !!privateZones.within(x, y, config?.privacyRadius || DEFAULT_RADIUS).length : false;
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