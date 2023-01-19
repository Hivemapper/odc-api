import { LORA_REQUEST_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { promises as Fs } from 'fs';
import { LORA_RESPONSE_FOLDER } from 'config/hdc-s';
import { initDirectory } from 'util/files';
import { createLoraFile } from 'util/lora';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  res.json({ ready: true });
});

router.post('/join', async (req: Request, res: Response) => {
  try {
    if (!(req.body && req.body.device)) throw new Error('No device found');
    await initDirectory(LORA_REQUEST_FOLDER);
    await initDirectory(LORA_RESPONSE_FOLDER);
    const created = await createLoraFile(
      'join',
      JSON.stringify(req.body.device),
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
    await initDirectory(LORA_REQUEST_FOLDER);
    await initDirectory(LORA_RESPONSE_FOLDER);
    await createLoraFile(
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
    const type = req.params.type;
    let extension = '';
    if (type === 'ping') extension = 'response';
    else if (type === 'join') extension = 'joined';
    else throw new Error('Type should be either join or ping');
    const dir = await Fs.readdir(LORA_RESPONSE_FOLDER);
    if (dir.length) {
      for (const file of dir) {
        const [, fileExtension] = file.split('.');
        if (fileExtension === extension) {
          return res.json({ ready: true });
        }
      }
    }
    res.json({ ready: false });
  } catch (error) {
    res.json({ error });
  }
});

export default router;
