import { exec } from 'child_process';
import {
    ML_MODELS, ML_ROOT_FOLDER,
  } from '../config';
  import { Router } from 'express';
  import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getConfig, updateConfigKey } from 'sqlite/config';

  const router = Router();
  
  router.get('/:name', (req, res) => {
    try {
      if (!req.params.name) {
        res.json({ error: 'need to provide model name' });
        return;
      }
      const modelPath = join(ML_ROOT_FOLDER, req.params.name);
      if (!existsSync(modelPath)) {
        res.json({ error: 'model does not exist' });
        return;
      }
      const modelStat = statSync(modelPath);
      const hash = existsSync(modelPath + '.hash') ? readFileSync(modelPath + '.hash', { encoding: 'utf-8' }) : '';
      res.json({ bytes: modelStat.size, hash });
    } catch (error: unknown) {
      res.json({ error });
    }
  });

  /**
   * To swap model,
   * 1. Get current model hash: GET /config -> compare hash
   * 2. If does not match, upload model using POST /upload
   * 3. Commit new model: POST /commit with body { name: 'ml', hash: 'new hash', bytes: 12345 }
   */
  router.post('/commit', async (req, res) => {
    try {
      if (!req.body.name || !req.body.bytes || !req.body.hash) {
        res.json({ error: 'need to provide model name or model path' });
        return;
      }
      if (!existsSync(ML_ROOT_FOLDER)) {
        mkdirSync(ML_ROOT_FOLDER);
      }
      const modelPath = join(ML_ROOT_FOLDER, req.body.name);
      if (!existsSync(modelPath)) {
        res.json({ error: 'model does not exist' });
        return;
      }
      const modelStat = statSync(modelPath);
      if (modelStat.size !== req.body.bytes) {
        res.json({ error: 'model size mismatch' });
        return;
      }
      writeFileSync(modelPath + '.hash', req.body.hash, { encoding: 'utf-8' });
      // make sure the name matches with the SQLite privacyModel config
      const { privacyModel } = await getConfig('privacyModel');
      if (privacyModel !== req.body.name) {
         await updateConfigKey('privacyModel', req.body.name);
      }

      exec('systemctl restart object-detection');
      res.json({ done: true } );
    } catch (error: unknown) {
      res.json({ error });
    }
  });
  
  export default router;
  