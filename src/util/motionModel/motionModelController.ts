import { querySensorData } from "sqlite";
import { DriveSession } from "./driveSession";
import { packFrameKm } from "./packaging";

const QUERY_WINDOW_SIZE = 10 * 1000;

const session = new DriveSession();
export async function MotionModelController() {
  if (!session.ready()) {
    setTimeout(MotionModelController, QUERY_WINDOW_SIZE);
    return;
  }
  
  const sensorData = await querySensorData(await session.getLastTime());
  if (sensorData.length) {
    console.log('First record:', sensorData[0].system_time, ' Last record:', sensorData[sensorData.length - 1].system_time);
  }

  session.ingestData(sensorData);
  await session.getSamplesAndSyncWithDb();

  let frameKMToProcess = await session.getNextFrameKMToProcess();
  while (frameKMToProcess) {
    await packFrameKm(frameKMToProcess);
    frameKMToProcess = await session.getNextFrameKMToProcess();
  }

  setTimeout(MotionModelController, QUERY_WINDOW_SIZE);
}

MotionModelController();

