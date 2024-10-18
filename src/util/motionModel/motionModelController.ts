import { querySensorData } from 'sqlite/common';
import { DriveSession } from './driveSession';
import { packFrameKm } from './packaging';
import { Instrumentation } from 'util/instrumentation';
import { getConfig } from 'sqlite/config';
import { MOTION_MODEL_QUERY_WINDOW_SIZE } from 'config';

let session = new DriveSession();

export async function MotionModelController() {
  try {
    // Pack any FrameKMs if ready
    let frameKMToProcess = await session.getNextFrameKMToProcess();
    while (frameKMToProcess?.length) {
      await packFrameKm(frameKMToProcess);
      frameKMToProcess = await session.getNextFrameKMToProcess(true);
    }

    // Do not query sensor data if dashcam session is not ready
    if (!session.ready()) {
      console.log("Waiting for session to be ready");
      setTimeout(MotionModelController, MOTION_MODEL_QUERY_WINDOW_SIZE);
      return;
    }
    if (!session.started) {
      session.start();
    }
    console.log("Iterating...");

    // if (await getConfig('isDashcamMLEnabled')) {
    //   // Repair ML job if needed
    //   await session.checkObjectDetectionService();
    // }

    const { gnss, imu, images } = await querySensorData(
      await session.getLastTime(), undefined, true
    );

    await session.ingestData(gnss, imu, images);
    await session.getSamplesAndSyncWithDb();
    await session.doHealthCheck();
  } catch (e: unknown) {
    console.log('Critical motion model controller error, investigate: ', e);
    Instrumentation.add({
      event: 'DashcamApiError',
      message: 'Motion model error',
    });
    session = new DriveSession();
  }

  setTimeout(MotionModelController, MOTION_MODEL_QUERY_WINDOW_SIZE);
}
