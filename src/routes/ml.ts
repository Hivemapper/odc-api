import {
    ML_MODELS,
  } from '../config';
  import { Request, Response, Router } from 'express';
  import { readFileSync, renameSync, writeFileSync } from 'fs';

  const router = Router();
  
  /**
   * To swap model,
   * 1. Get current model hash: GET /ml/hash?type=PVC
   * 2. Upload new model to /tmp/pvc.onnx using POST /upload
   * 3. Commit new model: POST /ml/commit with body { type: 'PVC', hash: 'new hash', path: '/tmp/pvc.onnx' }
   */
  router.get('/hash', async (req: Request, res: Response) => {
    try {
      if (!req.query.type) {
        res.json({ error: 'model type is required' });
        return;
      }
      // @ts-ignore
      const modelPath = ML_MODELS[req.query.type];
      if (!modelPath) {
        res.json({ error: 'model type is not supported' });
        return;
      }
      const hash = readFileSync(modelPath + '.hash', { encoding: 'utf-8' });
      res.json({ hash: hash.trim() } );
    } catch (error: unknown) {
      res.json({ error });
    }
  });

  router.post('/commit', (req, res) => {
    try {
      if (!req.body.type || !req.body.hash || !req.body.path) {
        res.json({ error: 'need to provide model type, tmp file path & updated hash' });
        return;
      }
      // @ts-ignore
      const modelPath = ML_MODELS[req.body.type];
      if (!modelPath) {
        res.json({ error: 'model type is not supported' });
        return;
      }
      renameSync(req.body.path, modelPath);
      writeFileSync(modelPath + '.hash', req.body.hash, { encoding: 'utf-8' });
      res.json({ done: true } );
    } catch (error: unknown) {
      res.json({ error });
    }
  });
  
  export default router;
  