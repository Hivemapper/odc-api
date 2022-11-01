import { FRAMEKM_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { existsSync, readdirSync, rmSync, stat } from 'fs';
import { concatFrames } from 'util/framekm';
import { map } from 'async';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const files = readdirSync(FRAMEKM_ROOT_FOLDER);
    res.json(files);
  } catch (error) {
    res.json([]);
  }
});

router.post('/:name', async (req: Request, res: Response) => {
  try {
    const frames = req.body?.frames;
    const bytesPacked = await concatFrames(frames, req.params.name);
    res.json({
      frames: bytesPacked,
    });
  } catch (error) {
    res.json({ error });
  }
});

router.get('/total', async (req: Request, res: Response) => {
  try {
    const files = readdirSync(FRAMEKM_ROOT_FOLDER);
    let total = 0;
    const fileStats: any[] = await map(
      files.map((frame: string) => FRAMEKM_ROOT_FOLDER + '/' + frame),
      stat,
    );
    for (const stat of fileStats) {
      total += stat.size;
    }
    res.json({
      total,
    });
  } catch (error) {
    console.log(error);
    res.json({
      total: 0,
    });
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
