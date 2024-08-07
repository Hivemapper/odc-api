import { CAMERA_TYPE, DB_PATH } from 'config';
import { Router } from 'express';
import { readdirSync } from 'fs';
import { getAsync, runAsync } from 'sqlite';
import { resetDB, resetSensorData } from 'sqlite/common';
import { fetchLastNErrorRecords } from 'sqlite/error';
import { clearAll, getAllFrameKms, getEstimatedProcessingTime, getFramesCount } from 'sqlite/framekm';
import { fetchNGnssRecords } from 'sqlite/gnss';
import { getServiceStatus } from 'sqlite/health_state';
import { fetchLastNImuRecords } from 'sqlite/imu';
import { CameraType } from 'types';
import { fetchLastNMagnetometerRecords } from 'sqlite/magnetometer';
import { getDateFromUnicodeTimestamp } from 'util/index';

const router = Router();

router.get('/gnss/:n', async (req, res) => {
  const { n } = req.params;
  try {
    const rows = await fetchNGnssRecords(Number(n));
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
    let time = Date.now();

    for (const file of files) {
      const insertSQL = `
        INSERT INTO framekms (
          image_name, image_path, speed, created_at, fkm_id, orientation, time
        ) VALUES (?, ?, ?, ?, ?, ?, ?);
      `;

      await runAsync(insertSQL, [
        file,
        dummyPath + req.params.name,
        speed,
        Date.now(),
        fkm_id,
        speed === 3 ? 3 : 1,
        time
      ]);
      time += 30;
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

router.get('/landmarks', async (req, res) => {
  try {
    let rows: any = await getAsync('SELECT rowid, * FROM landmarks WHERE lat IS NOT NULL AND lon IS NOT NULL ORDER BY rowid DESC;');
    res.send(rows);
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.get('/landmarks/pics', async (req, res) => {
  try {
    let rows: any = await getAsync('SELECT rowid, * FROM landmarks ORDER BY rowid DESC;');
    let html = `<h1>Number of landmarks: ${rows.length}</h1>`;
    html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px;">';
    for (const row of rows) {
      let name = row.thumbnail.split('/').pop() || '';
      let time = getDateFromUnicodeTimestamp(name);

      html += `<div style="display: flex; flex-direction: column; align-items: center;">`;
      html += `<img src="${row.thumbnail}" alt="${time.toISOString()}" style="width: 300px; height: 200px; object-fit: cover;" />`;
      // html += `<p>${time.toDateString()}</p>`
      html += `</div>`;
    }
    res.send(html);
  } catch (error) {
    res.status(500).send({ error });
  }
});

export default router;
