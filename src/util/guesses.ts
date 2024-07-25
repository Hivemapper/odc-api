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

const weightConfig = {
  distanceCoeff: 1,
  confidenceCoeff: 0.5,
  boxSizeCoeff: 1,
  frameIdCoeff: 0.5,
  centerProximityCoeff: 0.5,
};

/** Make the merging of multiple guesses together based on weights of multiple parameters: 
 * distance (closer - better), // detections[i].distance
 * box size (bigger box = more confidence) // detections[i].box: [x1, y1, x2, y2], (box[2] - box[0]) * (box[3] - box[1])
 * frame_id (more recent - better) // detections[i].frame_id
 * box location: center of the box (closer to the center - better) // detections[i].projectedBox: [x1, y1, x2, y2], (x1 + x2) / 2, (y1 + y2) / 2
 */

function getAverageCoordinatesBasedOnWeights(detections: SignGuess[]): { lat: number, lon: number } {
  const {
    distanceCoeff,
    boxSizeCoeff,
    frameIdCoeff,
    centerProximityCoeff,
    confidenceCoeff
  } = weightConfig;

  let totalWeight = 0;
  let weightedXSum = 0;
  let weightedYSum = 0;
  let weightedZSum = 0;

  const transformer = new CoordinateTransformer();

  detections.forEach(d => {
    const distanceWeight = (1 / d.distance) * distanceCoeff; // Closer distance gives higher weight
    const boxSize = (d.box[2] - d.box[0]) * (d.box[3] - d.box[1]);
    const boxSizeWeight = boxSize * boxSizeCoeff; // Bigger box gives higher weight
    const frameIDWeight = d.frame_id * frameIdCoeff; // More recent gives higher weight
    const boxCenterX = (d.projectedBox[0] + d.projectedBox[2]) / 2;
    const boxCenterY = (d.projectedBox[1] + d.projectedBox[3]) / 2;
    const centerProximityDistance = Math.sqrt((boxCenterX - 0.5) ** 2 + (boxCenterY - 0.5) ** 2);
    const centerProximityWeight = (1 / (centerProximityDistance + 1e-3)) * centerProximityCoeff; // Avoid division by very small numbers
    const confidenceWeight = d.confidence * confidenceCoeff; // Higher confidence gives higher weight

    const weight = distanceWeight + boxSizeWeight + frameIDWeight + centerProximityWeight + confidenceWeight;
    totalWeight += weight;

    const [x, y, z] = transformer.transformToGeocentric(d.sign_lon, d.sign_lat, 0);

    // Ensure transformations are correct
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
      console.error("Invalid geocentric coordinates:", { lon: d.sign_lon, lat: d.sign_lat, x, y, z });
      throw new Error("Invalid geocentric coordinates.");
    }

    weightedXSum += x * weight;
    weightedYSum += y * weight;
    weightedZSum += z * weight;
  });

  if (totalWeight === 0) {
    throw new Error("Total weight is zero, cannot compute average coordinates.");
  }

  const averageX = weightedXSum / totalWeight;
  const averageY = weightedYSum / totalWeight;
  const averageZ = weightedZSum / totalWeight;

  const [lon, lat] = transformer.transformToGeographic(averageX, averageY, averageZ);

  // Ensure final coordinates are finite
  if (!isFinite(lon) || !isFinite(lat)) {
    console.error("Invalid average coordinates:", { averageX, averageY, averageZ, lon, lat });
    throw new Error("Invalid average coordinates.");
  }

  return {
    lat: lat,
    lon: lon
  };
}

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
      } else {
        const { lat, lon } = getAverageCoordinatesBasedOnWeights(detections);
        aveDetection.lat = lat;
        aveDetection.lon = lon;
        aveDetection.label = detections[0].label;
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
        confidence: detection.confidence,
        box: detection.box,
        projectedBox: detection.projectedBox
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
    return this.reverseTransformer.forward([x, y, z]);
  }
}

const transformer = new CoordinateTransformer();