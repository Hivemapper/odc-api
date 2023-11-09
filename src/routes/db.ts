import { Router } from 'express';
import { clearAll, getFrameKmMetadata, getFramesCount, getPrevFrameKmTable } from 'sqlite/framekm';
import { fetchLastNGnssRecords } from 'sqlite/gnss';
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

router.get('/framekm', async (req, res) => {
    try {
        const rows = await getFrameKmMetadata();
        res.send(rows);
    } catch (error) {
        res.status(500).send({ error });
    }
});

router.get('/framekm/prev', async (req, res) => {
    try {
        const rows = await getPrevFrameKmTable();
        res.send(rows);
    } catch (error) {
        res.status(500).send({ error });
    }
});

router.get('/framekm/count', async (req, res) => {
    try {
        const count = await getFramesCount();
        res.send({
            count
        });
    } catch (error) {
        res.status(500).send({ error });
    }
});

router.get('/framekm/clear', async (req, res) => {
    try {
        await clearAll();
        res.send({
            done: true
        });
    } catch (error) {
        res.status(500).send({ error });
    }
});

export default router;