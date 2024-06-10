import proj4 from 'proj4';
// @ts-ignore
import KMeans from 'kmeans-js';
import { SignGuess, Landmark, SignDetectionMetadata, LandmarksByFrame } from 'types/detections';
import { FrameKmRecord } from 'types/sqlite';
import { moveWithDistanceAndHeading } from './geomath';
import { sign } from 'crypto';

const wgs84 = "WGS84";
const geocent = "+proj=geocent +datum=WGS84 +units=m +no_defs";
const TOTAL_POSSIBLE_DETECTION_FRAMES = 5;

export function mergeGuesses(detectionData: SignGuess[]): LandmarksByFrame {
  const groupsFound = findDetectionGroups(detectionData);
  const landmarksByFrame: LandmarksByFrame = {};
  let landmarkID = 0;

  for (const detection of detectionData) {
    if (!(detection.frame_name in landmarksByFrame)) {
      landmarksByFrame[detection.frame_name] = [];
    }
  }

  for (const label in groupsFound) {
    for (const detections of groupsFound[label]) {
      // Create a new merged guess object
      let aveDetection: Landmark = {
        lat: 0,
        lon: 0, 
        alt: 0,
        label: "None", 
        landmark_id: landmarkID,
        vehicle_heading: 0,
        detections: detections.map(d => d.detection_id),
        dashcam_lat: 0, // TODO: debug data for reference, will remove later
        dashcam_lon: 0,
      };
      if (!detections || detections.length === 0) {
        continue;
      } else if (detections.length === 1) {
        aveDetection.lat = detections[0].sign_lat;
        aveDetection.lon = detections[0].sign_lon;

        aveDetection.label = detections[0].label;
      } else if (detections.length < 5) {
        // pick the closest one by detection.distance
        const closest = detections.reduce((prev, curr) => {
          return prev.distance < curr.distance ? prev : curr;
        });
        aveDetection.lat = closest.sign_lat;
        aveDetection.lon = closest.sign_lon;
        aveDetection.label = closest.label;
      } else {
        const coordinates = detections.map((d: any) => [d.sign_lat, d.sign_lon]);
        const kmeans = new KMeans();
        kmeans.cluster(coordinates, 1);
        if (kmeans.centroids.length > 0) {
          // Investigate the error
          const centroid = kmeans.centroids[0];
          console.log(kmeans.centroids[0]);
          if (centroid.length > 1) {
            if (centroid[0] && centroid[0] !== Infinity && centroid[0] !== -Infinity) {
              aveDetection.lat = centroid[0];
              aveDetection.lon = centroid[1];
            } else {
              console.log('Something goes wrong with centroid calc', centroid);
            }
          } else {
            console.log('Empty centroid?', centroid);
          }
          aveDetection.label = detections[0].label;
        }
      }
      detections.map(d => {
        if (aveDetection.lat || aveDetection.lon) {
          aveDetection.vehicle_heading = d.heading;
          landmarksByFrame[d.frame_name].push(aveDetection);
        }
      });
      // Increment the detection ID counter to ensure unique IDs
      landmarkID++;
    }
  }
  return landmarksByFrame;
}

const stereo_width = 640;
const stereo_height = 480;
export function calculatePositionsForDetections(frame: FrameKmRecord, detections: SignDetectionMetadata[], orientation: number[]): SignGuess[] {
  let guesses = [];
  if (orientation.length === 4) {
    const [ pitch, roll, yaw, height ] = orientation;
    const hfov = 163;
    const vfov = 157;
    const imageCenterX = stereo_width / 2;
    const imageCenterY = stereo_height / 2;

    const cosRoll = Math.cos(roll * Math.PI / 180);
    const sinRoll = Math.sin(roll * Math.PI / 180);

    for (let detection of detections) {
      const { latitude, longitude, heading, image_name, ...rest } = frame;
      const box = detection.projectedBox;
      const rawCenterX = (box[0] + box[2]) / 2;
      const rawCenterY = (box[1] + box[3]) / 2;

      // Adjust for roll
      // const centerX = cosRoll * (rawCenterX - imageCenterX) - sinRoll * (rawCenterY - imageCenterY) + imageCenterX;
      // const centerY = sinRoll * (rawCenterX - imageCenterX) + cosRoll * (rawCenterY - imageCenterY) + imageCenterY;
      const centerX = rawCenterX;
      const centerY = rawCenterY;

      // Calculate horizontal and vertical angles
      const hor_angle = (centerX - imageCenterX) * hfov / stereo_width;
      const ver_angle = (centerY - imageCenterY) * vfov / stereo_height;

      // Correct distance for pitch
      const distance = detection.distance * Math.cos(ver_angle * Math.PI / 180);

      // Correct heading for yaw and horizontal angle
      const adjusted_heading = heading + yaw + hor_angle;

      const [ sign_lat, sign_lon ] = moveWithDistanceAndHeading(latitude, longitude, distance, adjusted_heading);

      const guess: SignGuess = {
        sign_lat: sign_lat,
        sign_lon: sign_lon,
        label: detection.class,
        frame_id: frame.frame_idx || 0,
        frame_name: frame.image_name,
        detection_id: detection.detectionId,
        heading: frame.heading,
        distance,
        timestamp: frame.system_time,
      };
      if (sign_lat === 0 || sign_lat === Infinity || sign_lat === -Infinity) {
        console.log('calculate position went wrong', latitude, longitude, heading, image_name, hor_angle, ver_angle, box);
      }
      guesses.push(guess);
    }
  }
  return guesses;
}

function findDetectionGroups(detections: SignGuess[], printGroups: boolean = false): Record<string, SignGuess[][]> {
  const groupsFound: Record<string, any[][]> = {};
  detections.forEach((detection: SignGuess) => {
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

function averageCoordinates(detections: SignGuess[]): [number, number] {
  if (!detections.length) {
    return [0, 0];
  }
  const sumCoords = detections.reduce((acc, curr) => {
    acc.lat += curr.sign_lat;
    acc.lon += curr.sign_lon;
    return acc;
  }, { lat: 0, lon: 0 });

  const numDetections = detections.length;
  const averageLat = sumCoords.lat / numDetections;
  const averageLon = sumCoords.lon / numDetections;
  return [averageLat, averageLon];
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