import { Router } from 'express';
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

export default router;