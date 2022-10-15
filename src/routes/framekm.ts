import { FRAMEKM_ROOT_FOLDER, FRAMES_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { existsSync, readdirSync, rmSync } from 'fs';
import { concatFrames } from 'util/framekm';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const files = readdirSync(FRAMEKM_ROOT_FOLDER);
    res.json(files);
  } catch (error) {
    res.json({ error });
  }
});

router.post('/:name', async (req: Request, res: Response) => {
  try {
    const files = readdirSync(FRAMES_ROOT_FOLDER);
    const bytesPacked = await concatFrames(files, req.params.name);
    res.json({
      frames: bytesPacked,
    });
  } catch (error) {
    res.json({ error });
  }
});

router.delete('/:name', async (req: Request, res: Response) => {
  try {
    const name = req.params.name;
    if (existsSync(FRAMEKM_ROOT_FOLDER + '/' + name)) {
      rmSync(FRAMEKM_ROOT_FOLDER + '/' + name);
    }
    res.json({
      deleted: true,
    });
  } catch (error) {
    res.json({ error });
  }
});

export default router;
