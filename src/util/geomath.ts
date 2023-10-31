import proj4 from 'proj4';
import * as GeoLib from 'geolib';
import * as THREE from 'three';
import { FramesMetadata } from 'types/motionModel';

const PROJ4_WGS84_LAT_LON =
  '+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees';
const PROJ4_WEB_MERCATOR =
  'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84", DATUM["WGS_1984", SPHEROID["WGS 84", 6378137.0, 298.257223563, AUTHORITY["EPSG", 7030]], TOWGS84[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], AUTHORITY["EPSG", 6326]], PRIMEM["greenwich", 0.0, AUTHORITY["EPSG", 8901]], UNIT["degree", 0.0174532925199433, AUTHORITY["EPSG", 9122]], AUTHORITY["EPSG", 4326]],PROJECTION["MERCATOR_1SP"],PARAMETER["false_easting", 0.0], PARAMETER["false_northing", 0.0], PARAMETER["central_meridian", 0.0], PARAMETER["scale_factor", 1.0], UNIT["metre", 1.0, AUTHORITY["EPSG", 9001]],EXTENSION["proj4", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs"], AXIS["X", EAST], AXIS["Y", NORTH],AUTHORITY["EPSG", 3857]]';
const PROJ4_ECEF = '+proj=geocent +ellps=WGS84 +datum=WGS84';

export function catmullRomCurve(
  points: any[],
  keys: [string, string | undefined, string | undefined],
  convertToECEF = false,
) {
  return new THREE.CatmullRomCurve3(
    points.map((p: any) => {
      const v3 = new THREE.Vector3(0, 0, 0);
      const [a, b, c] = keys;
      const x = (p[a] as number) ?? 0;
      const y = b ? (p[b] as number) ?? 0 : 0;
      const z = c ? (p[c] as number) ?? 0 : 0;
      v3.set(x, y, z);
      if (convertToECEF) {
        latLonToECEF(x, y, z, v3);
      }
      return v3;
    }),
  );
}

/**
 * Method to create new point based on two points and indx[0, 1] to calc the point between them
 *
 * @param first
 * first point
 * @param second
 * second point
 * @param indx
 * value in range [0, 1], is going to be used as index of interpolation between two points
 * @param keys
 * which keys to modify
 * @param res
 * point to apply values to
 * @returns
 */
export function interpolate(
  first: FramesMetadata,
  second: FramesMetadata,
  indx: number,
  keys: (keyof FramesMetadata)[],
  res: FramesMetadata,
): FramesMetadata {
  if (indx < 0) {
    // We should keep it in [0, 1] range. Otherwise it's a math error
    indx = 0;
    console.log('Potential math calc error during normalisation');
  }
  if (indx === 0) {
    return { ...first };
  }
  if (indx === 1) {
    return { ...second };
  }
  for (const key of keys) {
    const firstVal = first[key] || 0;
    const secondVal = second[key] || 0;
    // @ts-ignore
    res[key] = +firstVal + (+secondVal - +firstVal) * indx;
  }
  return res;
}

export function latLonToECEFDist(p0: THREE.Vector3, p1: THREE.Vector3) {
  latLonToECEF(p0.x, p0.y, p0.z, p0);
  latLonToECEF(p1.x, p1.y, p1.z, p1);

  return p0.distanceTo(p1);
}

export function latLonToECEFDistance(a: any, b: any) {
  const aPoint = new THREE.Vector3(0, 0, 0);
  const bPoint = new THREE.Vector3(0, 0, 0);
  latLonToECEF(
    a.lon || a.longitude,
    a.lat || a.latitude,
    a.alt || a.height,
    aPoint,
  );
  latLonToECEF(
    b.lon || b.longitude,
    b.lat || b.latitude,
    b.alt || b.height,
    bPoint,
  );
  return aPoint.distanceTo(bPoint);
}

export function latLonToECEF(
  lon: number,
  lat: number,
  altitude: number,
  out: THREE.Vector3,
) {
  const results = proj4(PROJ4_WGS84_LAT_LON, PROJ4_ECEF, [lon, lat, altitude]);
  out.set(results[0], results[1], results[2]);
}

export function ecefToLLA(x: number, y: number, z: number, out: THREE.Vector3) {
  const results = proj4(PROJ4_ECEF, PROJ4_WGS84_LAT_LON, [x, y, z]);
  out.set(results[0], results[1], results[2]);
}

export function latLonToWebMercator(
  lat: number,
  lon: number,
  out?: THREE.Vector2,
) {
  const from = PROJ4_WGS84_LAT_LON;
  const to = PROJ4_WEB_MERCATOR;

  const results = proj4(from, to, [lon, lat]);

  if (out) {
    out.set(results[0], results[1]);
    return out;
  } else {
    return { x: results[0], y: results[1] };
  }
}

export function webMercatorToLatLon(x: number, y: number, out?: THREE.Vector2) {
  const from = PROJ4_WEB_MERCATOR;
  const to = PROJ4_WGS84_LAT_LON;

  const results = proj4(from, to, [x, y]);

  if (out) {
    out.set(results[0], results[1]);
    return out;
  } else {
    return { lon: results[0], lat: results[1] };
  }
}

export function distance3(
  x1: number,
  x2: number,
  y1: number,
  y2: number,
  z1: number,
  z2: number,
) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2);
}

export function latLonDistance(
  lat1: number,
  lat2: number,
  lon1: number,
  lon2: number,
  accuracy = 0.01,
) {
  return GeoLib.getPreciseDistance(
    { latitude: lat1, longitude: lon1 },
    { latitude: lat2, longitude: lon2 },
    accuracy,
  );
}

export const METERS_TO_MILES = 0.000621371;
export const KM_TO_MILEs = 0.621371;
