import { PRIVACY_ZONES_CONFIG } from 'config';
import { Router } from 'express';
import { writeFileSync } from 'fs';
import { isPrivateLocation, setPrivateZones } from 'util/privacy';

const router = Router();

router.post('/', (req, res) => {
    try {
        if (Array.isArray(req.body.coordinates)) {
            setPrivateZones(req.body.coordinates);
            writeFileSync(PRIVACY_ZONES_CONFIG, JSON.stringify(req.body.coordinates), { encoding: 'utf-8' });
        }
        res.json({
            done: true,
        });
    } catch (error: unknown) {
        console.log(error);
        res.json({ error });
    }
});

router.post('/check', (req, res) => {
    try {
        if (!req.body.lat || !req.body.lon) {
            res.json({ error: 'Need to provide lat and lon' });
        }
        res.json({
            isPrivate: isPrivateLocation(req.body.lat, req.body.lon),
        });
    } catch (error: unknown) {
        console.log(error);
        res.json({ error });
    }
});

export default router;