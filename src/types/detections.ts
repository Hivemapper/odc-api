export interface SignGuess {
    sign_lat: number;
    sign_lon: number;
    label: string;
    frame_id: number;
    frame_name: string;
    detection_id: number;
    distance: number;
    timestamp: number;
}

export type SignDetectionMetadata = {
  detectionId: number;
  class: string;
  confidence: number;
  box: [number, number, number, number];
  projectedBox: [number, number, number, number];
  distance: number;
}

// Type definitions for the averaged location data
export interface Landmark {
  landmark_id: number;
  lat: number;
  lon: number;
  label: string;
  detections: number[];
}

export type TransformedLandmark = [number, number, number, string, number[]];

export type LandmarksByFrame = Record<string, Landmark[]>;
