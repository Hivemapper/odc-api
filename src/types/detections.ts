export interface Detection {
    sign_lat: number;
    sign_lon: number;
    label: string;
    frame_id: number;
    detection_id: number;
    distance: number;
    timestamp: number;
}

// Type definitions for the averaged location data
export interface MergedGuess {
    lat: number;
    lon: number;
    label: string;
    detection_id: number;
    frame_mapping: { [key: number]: number };
}
