export interface SignGuess {
    sign_lat: number;
    sign_lon: number;
    label: string;
    frame_id: number;
    frame_name: string;
    detection_id: number;
    distance: number;
    heading: number;
    timestamp: number;
}

export type SignDetectionMetadata = {
  detectionId: number;
  class: string;
  confidence: number;
  box: [number, number, number, number];
  projectedBox: [number, number, number, number];
  distance: number;
  azimuth: number;
  width: number;
  height: number;
}

// Type definitions for the averaged location data
export interface Landmark {
  landmark_id: number;
  lat: number;
  lon: number;
  alt: number;
  label: string;
  vehicle_heading: number;
  dashcam_lat: number;
  dashcam_lon: number;
  detections: number[];
}

export type TransformedLandmark = [number, number, number, number, string, number, number[]];

export type LandmarksByFrame = Record<string, Landmark[]>;
