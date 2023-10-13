import { Router } from 'express';
import { fetchLastNRecords } from 'sqlite/gps';

const router = Router();

router.post('/gps/:n', async (req, res) => {
    const { n } = req.params;
    try {
        const rows = await fetchLastNRecords(Number(n));
        res.send(rows);
    } catch (error) {
        res.status(500).send({ error });
    }
});

export default router;