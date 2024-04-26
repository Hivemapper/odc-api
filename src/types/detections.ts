export interface SignGuess {
    sign_lat: number;
    sign_lon: number;
    label: string;
    frame_id: number;
    detection_id: number;
    distance: number;
    timestamp: number;
}

// Type definitions for the averaged location data
export interface Landmark {
    lat: number;
    lon: number;
    label: string;
    landmark_id: number;
    detections: number[];
}
