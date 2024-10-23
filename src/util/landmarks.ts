import { MergedLandmark } from "types/motionModel";

export const countUniqueMapFeatures = (landmarks: MergedLandmark[]) => {
    let counter = 0;
    let mapFeatures = new Set();
    for (const landmark of landmarks) {
      if (landmark.map_feature_id && !mapFeatures.has(landmark.map_feature_id)) {
        mapFeatures.add(landmark.map_feature_id);
        counter++;
      }
    }
    return counter;
  };