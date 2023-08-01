import { Request, Response, Router } from 'express';
import console from 'console';
import { readdirSync, statSync, createReadStream, existsSync, rmSync } from 'fs';
import { RAW_DATA_ROOT_FOLDER } from '../config';

const router = Router();

// Returns all the files inside the folder RAW_DATA_ROOT_FOLDER
router.get('/raw', async (req: Request, res: Response) => {
  try {
    const files = readdirSync(RAW_DATA_ROOT_FOLDER);
    res.json(files);
  } catch (error: unknown) {
    console.error(`reading dir ${RAW_DATA_ROOT_FOLDER}`, error);
    res.json([]);
  }
});

// Return the contents of the file named :name under RAW_DATA_ROOT_FOLDER
router.get('/raw/:name', async (req: Request, res: Response) => {
  try {
    const filepath = `${RAW_DATA_ROOT_FOLDER}/${req.params.name}`;
    const stat = statSync(filepath);

    res.writeHead(200, {
      'Content-Type': 'application/x-gzip',
      'Content-Length': stat.size
    });

    const readStream = createReadStream(filepath);
    readStream.pipe(res);
  } catch (error: unknown) {
    console.error(`fetching file ${req.params.name}`)
    res.json('')
  }
});

// Delete the contents of the file named :name under RAW_DATA_ROOT_FOLDER
router.delete('/raw/:name', async(req: Request, res: Response) => {
  try {
    const filepath = `${RAW_DATA_ROOT_FOLDER}/${req.params.name}`;
    if (existsSync(filepath)) {
      rmSync(filepath);
    }
    res.json({
      deleted: true,
    });
  } catch (error: unknown) {
    res.json({ error });
  }
});

export default router;
