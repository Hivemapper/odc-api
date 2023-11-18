import { querySensorData } from "sqlite";
import { DriveSession } from "./driveSession";
import { packFrameKm } from "./packaging";

const QUERY_WINDOW_SIZE = 10 * 1000;

let session = new DriveSession();

export async function MotionModelController() {
  try {
    // Pack any FrameKMs if ready
    let frameKMToProcess = await session.getNextFrameKMToProcess();
    while (frameKMToProcess?.length) {
      await packFrameKm(frameKMToProcess);
      frameKMToProcess = await session.getNextFrameKMToProcess();
    }
  
    // Do not query sensor data if dashcam session is not ready
    if (!session.ready()) {
      setTimeout(MotionModelController, QUERY_WINDOW_SIZE);
      return;
    }
  

    const {
      gnss, imu, images
    } = await querySensorData(await session.getLastTime());
  
    session.ingestData(gnss, imu, images);
    await session.getSamplesAndSyncWithDb();

    // TODO: utilise raw logs: collect, pack, etc here


  } catch (e: unknown) {
    console.log('Critical motion model controller error, investigate: ', e);
    session = new DriveSession();
  }

  setTimeout(MotionModelController, QUERY_WINDOW_SIZE);
}

