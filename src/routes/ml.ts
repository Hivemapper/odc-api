import {
    ML_MODELS, ML_ROOT_FOLDER,
  } from '../config';
  import { Router } from 'express';
  import { existsSync, mkdirSync, renameSync, writeFileSync } from 'fs';
//import { restartPrivacyProcess } from 'services/privacyWatcher';

  const router = Router();
  
  /**
   * To swap model,
   * 1. Get current model hash: GET /config -> modelHashes
   * 2. Upload new model to /tmp/pvc.onnx using POST /upload
   * 3. Commit new model: POST /ml/commit with body { type: 'PVC', hash: 'new hash', path: '/tmp/pvc.onnx' }
   */
  router.post('/commit', (req, res) => {
    try {
      if (!req.body.type || !req.body.hash || !req.body.path) {
        res.json({ error: 'need to provide model type, tmp file path & updated hash' });
        return;
      }
      const modelPath = ML_MODELS[req.body.type];
      if (!modelPath) {
        res.json({ error: 'model type is not supported' });
        return;
      }
      if (!existsSync(ML_ROOT_FOLDER)) {
        mkdirSync(ML_ROOT_FOLDER);
      }
      renameSync(req.body.path, modelPath);
      writeFileSync(modelPath + '.hash', req.body.hash, { encoding: 'utf-8' });
      // restartPrivacyProcess();
      res.json({ done: true } );
    } catch (error: unknown) {
      res.json({ error });
    }
  });
  
  export default router;
  