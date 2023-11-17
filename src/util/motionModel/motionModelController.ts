import { querySensorData } from "sqlite";
import { DriveSession } from "./driveSession";
import { packFrameKm } from "./packaging";

const QUERY_WINDOW_SIZE = 10 * 1000;

let session = new DriveSession();

export async function MotionModelController() {
  try {
    let frameKMToProcess = await session.getNextFrameKMToProcess();
    while (frameKMToProcess?.length) {
      await packFrameKm(frameKMToProcess);
      frameKMToProcess = await session.getNextFrameKMToProcess();
    }
  
    if (!session.ready()) {
      setTimeout(MotionModelController, QUERY_WINDOW_SIZE);
      return;
    }
  
    console.log('');
    console.log('');
    console.log('//////////////////////////////////////////////////');
    console.log('/////////////// ITERATION ////////////////////////');
    console.log('//////////////////////////////////////////////////');
    
    const {
      gnss, imu, images
    } = await querySensorData(await session.getLastTime());
  
    session.ingestData(gnss, imu, images);
    await session.getSamplesAndSyncWithDb();
  } catch (e: unknown) {
    console.log('Critical motion model controller error, investigate: ', e);
    session = new DriveSession();
  }

  setTimeout(MotionModelController, QUERY_WINDOW_SIZE);
}

