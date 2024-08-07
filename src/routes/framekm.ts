import { FRAMEKM_ROOT_FOLDER, STREAM_REQUEST_FOLDER, UNPROCESSED_FRAMEKM_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import {
  createReadStream,
  existsSync,
  promises,
  mkdirSync,
  readdir,
  rmSync,
  statSync,
} from 'fs';
import { getNumFramesFromChunkName } from 'util/framekm';
import { exec } from 'child_process';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const files = await promises.readdir(FRAMEKM_ROOT_FOLDER);
    res.json(files);
  } catch (error) {
    res.json([]);
  }
});

router.get('/unprocessed', async (req: Request, res: Response) => {
  try {
    const files = (await promises.readdir(UNPROCESSED_FRAMEKM_ROOT_FOLDER)).filter((f) => f.startsWith('km_'));
    let frames = 0;
    for (const file of files) {
      try {
        const numFrames = getNumFramesFromChunkName(file);
        if (Number.isInteger(numFrames)) {
          frames += numFrames;
        }
      } catch (e: unknown) {
        console.log(e);
      }
    }
    res.json({
      count: files.length,
      frames
    });
  } catch (error) {
    res.json([]);
  }
});

let i = 0;
let keepAliveInterval: any = null;
let fileToDownload = '';
let isInProgress = false;

router.get('/stream', async (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-control': 'no-cache',
  });
  if (!existsSync(STREAM_REQUEST_FOLDER)) {
    mkdirSync(STREAM_REQUEST_FOLDER);
  }

  console.log('Download pipe opened');

  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
  isInProgress = false;

  const cleanupDownloadProgress = () => {
    console.log('Download: finished: ' + fileToDownload);
    isInProgress = false;
    if (
      fileToDownload &&
      existsSync(STREAM_REQUEST_FOLDER + '/' + fileToDownload)
    ) {
      try {
        rmSync(STREAM_REQUEST_FOLDER + '/' + fileToDownload);
      } catch (e: unknown) {
        console.log(e);
      }
      if (res) {
        res.write(JSON.stringify({ name: fileToDownload, done: true }));
      }
    }
    fileToDownload = '';
  };

  const resetStreamState = () => {
    console.log('Download pipe finished');
    isInProgress = false;
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  };

  res
    .on('unpipe', cleanupDownloadProgress)
    .on('error', cleanupDownloadProgress)
    .on('close', resetStreamState)
    .on('finish', resetStreamState);

  try {
    if (!keepAliveInterval) {
      res.write(JSON.stringify({ keepAlive: i }));
      keepAliveInterval = setInterval(() => {
        if (!isInProgress) {
          res.write(JSON.stringify({ keepAlive: ++i }));
          readdir(
            STREAM_REQUEST_FOLDER,
            (err: NodeJS.ErrnoException | null, files: string[]) => {
              if (files.length) {
                isInProgress = true;
                try {
                  fileToDownload = files[0];

                  console.log('Download: start: ' + fileToDownload);
                  if (existsSync(FRAMEKM_ROOT_FOLDER + '/' + fileToDownload)) {
                    const fileStat = statSync(
                      FRAMEKM_ROOT_FOLDER + '/' + fileToDownload,
                    );
                    res.write(
                      JSON.stringify({
                        name: fileToDownload,
                        bytes: fileStat.size,
                      }),
                    );
                    const stream = createReadStream(
                      FRAMEKM_ROOT_FOLDER + '/' + fileToDownload,
                      'base64',
                    );
                    stream.pipe(res, { end: false });
                  } else {
                    cleanupDownloadProgress();
                  }
                } catch (err: unknown) {
                  console.log('Download pipe caught error on file read');
                  res.write(JSON.stringify({ error: err }));
                  isInProgress = false;
                }
              }
            },
          );
        }
      }, 3000);
    }
  } catch (error: unknown) {
    i = 0;
    console.log('Download pipe error');
    res.end(JSON.stringify({ error }));
  }
});

router.get('/reset', async (req: Request, res: Response) => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
  isInProgress = false;
  fileToDownload = '';
  res.json({
    done: true,
  });
});

router.get('/request/:name', async (req: Request, res: Response) => {
  try {
    if (req.params.name) {
      exec('touch ' + STREAM_REQUEST_FOLDER + '/' + req.params.name);
    }
    res.json({
      done: true,
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
