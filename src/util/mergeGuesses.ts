import proj4 from 'proj4';
import KMeans from 'kmeans-js';
import { Detection, MergedGuess } from 'types/detections';

const wgs84 = "WGS84";
const geocent = "+proj=geocent +datum=WGS84 +units=m +no_defs";
const TOTAL_POSSIBLE_DETECTION_FRAMES = 5;

export async function mergeGuesses(detectionData: Detection[]): Promise<MergedGuess[]> {
  const groupsFound = findDetectionGroups(detectionData);
  const aveLocations: any[] = [];
  let idCounter = 0;

  for (const label in groupsFound) {
    for (const detections of groupsFound[label]) {
      // Create a new merged guess object
      let aveDetection: MergedGuess = {
        lat: 0,
        lon: 0, 
        label: "None", 
        detection_id: idCounter,
        frame_mapping: {} 
      };
      if (detections.length === 0) {
        continue;
      } else if (detections.length === 1) {
        aveDetection.lat = detections[0].sign_lat;
        aveDetection.lon = detections[0].sign_lon;
        aveDetection.label = detections[0].label;
        aveDetection.frame_mapping = { [detections[0].frame_id]: detections[0].detection_id };
        aveLocations.push(aveDetection);
      } else if (detections.length === 2) {
        const [lat, lon, _] = averageCoordinates(detections);
        aveDetection.lat = lat;
        aveDetection.lon = lon;
        aveDetection.label = detections[0].label;
        for (const detection of detections) {
          aveDetection.frame_mapping[detection.frame_id] = detection.detection_id;
        }
        aveLocations.push(aveDetection);
      } else {
        const coordinates = detections.map((d: any) => [d.sign_lat, d.sign_lon]);
        const kmeans = new KMeans();
        kmeans.cluster(coordinates, 1);
        if (kmeans.centroids.length > 0) {
          const centroid = kmeans.centroids[0].centroid;
          aveDetection.lat = centroid[0];
          aveDetection.lon = centroid[1];
          aveDetection.label = detections[0].label;
          for (const detection of detections) {
            aveDetection.frame_mapping[detection.frame_id] = detection.detection_id;
          }
          aveLocations.push(aveDetection);
        }
      }
      // Increment the detection ID counter to ensure unique IDs
      idCounter++;
    }
  }
  return aveLocations;
}

function findDetectionGroups(detections: Detection[], printGroups: boolean = false): Record<string, Detection[][]> {
  const groupsFound: Record<string, any[][]> = {};
  detections.forEach((detection: Detection) => {
    const label = detection.label;
    if (!(label in groupsFound)) {
      groupsFound[label] = [[detection]];
    } else {
      const latestGroup = groupsFound[label][groupsFound[label].length - 1];
      if (detection.frame_id - latestGroup[latestGroup.length - 1].frame_id < TOTAL_POSSIBLE_DETECTION_FRAMES - latestGroup.length) {
        latestGroup.push(detection);
      } else {
        groupsFound[label].push([detection]);
      }
    }
  });

  if (printGroups) {
    console.log(groupsFound);
  }

  return groupsFound;
}

function averageCoordinates(detections: Detection[]): [number, number, number] {
  const coords = detections.map(d => {
    const [x, y, z] = transformer.transformToGeocentric(d.sign_lon, d.sign_lat);
    return { x, y, z };
  });

  const sumCoords = coords.reduce((acc, curr) => {
    acc.x += curr.x;
    acc.y += curr.y;
    acc.z += curr.z;
    return acc;
  }, { x: 0, y: 0, z: 0 });

  const numDetections = detections.length;
  const averageX = sumCoords.x / numDetections;
  const averageY = sumCoords.y / numDetections;
  const averageZ = sumCoords.z / numDetections;

  const [averageLon, averageLat, _] = transformer.transformToGeographic(averageX, averageY, averageZ);
  return [averageLat, averageLon, 0];
}

class CoordinateTransformer {
    private forwardTransformer: proj4.Converter;
    private reverseTransformer: proj4.Converter;

    constructor() {
      this.forwardTransformer = proj4(wgs84, geocent);
      this.reverseTransformer = proj4(geocent, wgs84);
    }

    public transformToGeocentric(lon: number, lat: number, alt: number = 0): number[] {
      return this.forwardTransformer.forward([lon, lat, alt]);
    }

    public transformToGeographic(x: number, y: number, z: number): number[] {
      return this.reverseTransformer.inverse([x, y, z]);
    }
  }

  const transformer = new CoordinateTransformer();