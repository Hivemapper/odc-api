import { FRAMEKM_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { existsSync, readdirSync, rmSync } from 'fs';
import { concatFrames } from 'util/framekm';
import { exec } from 'child_process';

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
    const frames = req.body && req.body.frames ? req.body.frames : [];
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
    exec(
      'du -sb /mnt/data/framekm',
      {
        encoding: 'utf-8',
      },
      (error, stdout, stderr) => {
        if (error) {
          console.log(error);
          res.json({ error: stdout || stderr });
        } else {
          const total = Number(stdout.split('\t')[0]);
          res.json({
            bytes: total || 0,
          });
        }
      },
    );
  } catch (error: unknown) {
    res.json({ bytes: 0 });
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
