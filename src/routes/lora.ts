import { LORA_REQUEST_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { readdirSync, statSync } from 'fs';
import { LORA_RESPONSE_FOLDER } from 'config/hdc-s';
import { initDirectory } from 'util/files';
import { createLoraFile } from 'util/lora';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  res.json({ ready: true });
});

router.post('/join', async (req: Request, res: Response) => {
  try {
    if (!req.body?.device) throw new Error('No device found');
    initDirectory(LORA_REQUEST_FOLDER);
    initDirectory(LORA_RESPONSE_FOLDER);
    const created = createLoraFile(
      'join',
      req.body.device,
      LORA_REQUEST_FOLDER,
    );
    res.json({ created });
  } catch (error) {
    res.json({ error });
  }
});

router.post('/ping', async (req: Request, res: Response) => {
  try {
    const { payload = '' } = req.body;
    const buffer = Buffer.from(payload);
    const encoded = buffer.toString('base64');
    const timestamp = Date.now();
    const content = {
      timestamp,
      message_id: 1,
      payload: encoded,
      port: 1,
      confirm: true,
    };
    initDirectory(LORA_REQUEST_FOLDER);
    createLoraFile(
      'message',
      JSON.stringify(content),
      LORA_REQUEST_FOLDER,
      timestamp + '',
    );

    res.json({ created: timestamp });
  } catch (error) {
    res.json({ error });
  }
});

router.get('/verify/:type', async (req: Request, res: Response) => {
  try {
    const { created } = req.query;
    const type = req.params.type;
    let extension = '';
    if (type === 'ping') extension = 'response';
    else if (type === 'join') extension = 'joined';
    else throw new Error('Type should be either join or ping');

    let files = readdirSync(LORA_RESPONSE_FOLDER);
    if (files.length) {
      files = files.filter((filename: string) => {
        const { birthtime } = statSync(LORA_RESPONSE_FOLDER + '/' + filename);
        const timestamp = Number(created) || 0;
        return (
          filename.split('.')?.[1] === extension &&
          birthtime.getTime() > timestamp
        );
      });
      if (files.length) {
        res.json({ ready: true });
      }
    }
    res.json({ ready: false });
  } catch (error) {
    res.json({ error });
  }
});

export default router;
