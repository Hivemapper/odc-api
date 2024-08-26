import { CAMERA_TYPE, DB_PATH, CMD, DB_BACKUP_PATH } from 'config';
import { Router } from 'express';
import { readdirSync } from 'fs';
import { runAsync } from 'sqlite';
import { resetDB, resetSensorData } from 'sqlite/common';
import { fetchLastNErrorRecords } from 'sqlite/error';
import { clearAll, getAllFrameKms, getEstimatedProcessingTime, getFramesCount } from 'sqlite/framekm';
import { fetchLastNGnssRecords } from 'sqlite/gnss';
import { getServiceStatus } from 'sqlite/health_state';
import { fetchLastNImuRecords } from 'sqlite/imu';
import { CameraType } from 'types';
import { fetchLastNMagnetometerRecords } from 'sqlite/magnetometer';
import { promisify } from 'util';
import { exec } from 'child_process';
import { DB_BACKUPSCRIPT_PATH } from 'config/hdc-s';
import { runSequence } from 'util/runCommands';
const asyncExec = promisify(exec);
const router = Router();

router.get('/gnss/:n', async (req, res) => {
  const { n } = req.params;
  try {
    const rows = await fetchLastNGnssRecords(Number(n));
    res.send(rows);
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/path', async (req, res) => {
  try {
    res.send({
      path: DB_PATH,
    });
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/imu/:n', async (req, res) => {
  const { n } = req.params;
  try {
    const rows = await fetchLastNImuRecords(Number(n));
    res.send(rows);
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/magnetometer/:n', async (req, res) => {
  const { n } = req.params;
  try {
    const rows = await fetchLastNMagnetometerRecords(Number(n));
    res.send(rows);
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/errors/:n', async (req, res) => {
  const { n } = req.params;
  try {
    const rows = await fetchLastNErrorRecords(Number(n));
    res.send(rows);
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/framekm/metadata', async (req, res) => {
  try {
    const rows = await getAllFrameKms();
    res.send(rows);
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/framekm/count', async (req, res) => {
  try {
    const count = await getFramesCount();
    res.send({
      count,
    });
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/framekm/estimate', async (req, res) => {
  try {
    const seconds = await getEstimatedProcessingTime();
    res.send({
      seconds,
    });
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/path', async (req, res) => {
  try {
    res.send({
      path: DB_PATH,
    });
  } catch (error) {
    res.status(500).send({ error });
  }
});

// TODO: for debug purposes, remove later
router.get('/framekm/clear', async (req, res) => {
  try {
    await clearAll();
    res.send({
      done: true,
    });
  } catch (error) {
    res.status(500).send({ error });
  }
});

let fkm_id = 0;
router.get('/framekm/add/:name/:speed', async (req, res) => {
  try {
    const dummyPath = CAMERA_TYPE === CameraType.Hdc ? '/mnt/data/python/frames/' : '/data/python/frames/';
    const files = readdirSync(dummyPath + req.params.name);
    const speed = Number(req.params.speed);
    fkm_id++;
    for (const file of files) {
      const insertSQL = `
        INSERT INTO framekms (
          image_name, image_path, speed, created_at, fkm_id, orientation
        ) VALUES (?, ?, ?, ?, ?, ?);
      `;

      await runAsync(insertSQL, [
        file,
        dummyPath + req.params.name,
        speed,
        Date.now(),
        fkm_id,
        speed === 3 ? 3 : 1,
      ]);
    }
    
    res.send({
      done: true,
    });
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/state/:name', async (req, res) => {
  try {
    const status = await getServiceStatus(req.params.name);
    res.send({
      status
    });
  } catch (error) {
    res.status(500).send({ error });
  }
});

// TODO: for debug purposes, remove later
router.get('/reset', async (req, res) => {
  try {
    await resetDB();
    res.send({
      done: true,
    });
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/sensor_reset', async (req, res) => {
  try {
    await resetSensorData();
    res.send({
      done: true,
    });
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/resetconfig', async (req, res) => {
  try {
    await runAsync('DELETE FROM config;');
    res.send({
      done: true,
    });
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/backup', async (req, res) => {
  try {
    console.log("Hitting backup endpoint")
    const stopServiceCommands = [CMD.STOP_SENSOR_FUSION, CMD.STOP_OBJECT_DETECTION, CMD.STOP_DATA_LOGGER];
    const startServiceCommands = [CMD.START_SENSOR_FUSION, CMD.START_OBJECT_DETECTION, CMD.START_DATA_LOGGER]
    await runSequence(stopServiceCommands);
    const {stdout, stderr} = await asyncExec(`python3 ${DB_BACKUPSCRIPT_PATH} ${DB_PATH}`);
    console.log("Output from backup.py file:", stdout, stderr);
    await runSequence(startServiceCommands);
    res.send({
      path: DB_BACKUP_PATH,
    });

  } catch (error) {
    res.status(500).send({ error });
  }
});
export default router;
