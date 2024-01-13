import { Router } from 'express';
import { readdirSync } from 'fs';
import { db, runAsync } from 'sqlite';
import { resetDB } from 'sqlite/common';
import { fetchLastNErrorRecords } from 'sqlite/error';
import { clearAll, getAllFrameKms, getFramesCount } from 'sqlite/framekm';
import { fetchLastNGnssRecords } from 'sqlite/gnss';
import { getServiceStatus } from 'sqlite/health_state';
import { fetchLastNImuRecords } from 'sqlite/imu';

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

router.get('/imu/:n', async (req, res) => {
  const { n } = req.params;
  try {
    const rows = await fetchLastNImuRecords(Number(n));
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

router.get('/framekm/add/:name/:speed', async (req, res) => {
  try {
    const files = readdirSync('/data/python/frames/' + req.params.name);
    for (const file of files) {
      const insertSQL = `
        INSERT INTO framekms (
          image_name, image_path, speed, created_at
        ) VALUES (?, ?, ?, ?);
      `;
      await runAsync(db, insertSQL, [
        file,
        '/data/python/frames/' + req.params.name,
        Number(req.params.speed),
        Date.now(),
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

export default router;
