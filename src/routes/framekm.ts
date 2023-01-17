import { FRAMEKM_ROOT_FOLDER, STREAM_REQUEST_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdir,
  readdirSync,
  rmSync,
} from 'fs';
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

let i = 0;
let keepAliveInterval: any = null;
let mainStream: any = null;
let isInProgress = false;

router.get('/stream', async (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-control': 'no-cache',
  });
  if (!existsSync(STREAM_REQUEST_FOLDER)) {
    mkdirSync(STREAM_REQUEST_FOLDER);
  }

  mainStream = res;

  try {
    if (!keepAliveInterval) {
      keepAliveInterval = setInterval(() => {
        if (!isInProgress) {
          mainStream.write(JSON.stringify({ keepAlive: ++i }));
          readdir(
            STREAM_REQUEST_FOLDER,
            (err: NodeJS.ErrnoException | null, files: string[]) => {
              if (files.length) {
                isInProgress = true;
                try {
                  mainStream.write(
                    JSON.stringify({ name: files[0], bytes: 0 }),
                  );
                  const stream = createReadStream(
                    FRAMEKM_ROOT_FOLDER + '/' + files[0],
                  );
                  stream
                    .pipe(mainStream, { end: false })
                    .on('unpipe', () => {
                      isInProgress = false;
                      rmSync(STREAM_REQUEST_FOLDER + '/' + files[0]);
                    })
                    .on('error', (err: any) => {
                      res.write(JSON.stringify({ error: err }));
                      isInProgress = false;
                      rmSync(STREAM_REQUEST_FOLDER + '/' + files[0]);
                    });
                } catch (error) {
                  res.write(JSON.stringify({ error }));
                  isInProgress = false;
                }
              }
            },
          );
        }
      }, 5000);
    }
  } catch (error: unknown) {
    i = 0;
    res.end(JSON.stringify({ error }));
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
