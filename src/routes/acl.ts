import { ACL_FILES_PATH, ACL_TOOL_PATH } from '../config';
import { Request, Response, Router } from 'express';
import { exec, ExecException } from 'child_process';
const router = Router();

router.get('/load', async (req: Request, res: Response) => {
  try {
    exec(
      `${ACL_TOOL_PATH} load ${ACL_FILES_PATH}`,
      {
        encoding: 'utf-8',
      },
      (_error: ExecException | null, output: string, error: string) => {
        _error ? res.json({ output }) : res.json({ error });
      },
    );
  } catch (error: unknown) {
    res.json({ error });
  }
});

router.get('/clear', async (_req: Request, res: Response) => {
  try {
    exec(
      `${ACL_TOOL_PATH} clear ${ACL_FILES_PATH}`,
      {
        encoding: 'utf-8',
      },
      (_error: ExecException | null, output: string, error: string) => {
        _error ? res.json({ output }) : res.json({ error });
      },
    );
  } catch (error: unknown) {
    res.json({ error });
  }
});

router.post('/store', (req: Request, res: Response) => {
  try {
    exec(
      `${ACL_TOOL_PATH} store ${req.body.hex} ${req.body.signature} ${ACL_FILES_PATH}`,
      {
        encoding: 'utf-8',
      },
      (_error: ExecException | null, output: string, error: string) => {
        _error ? res.json({ output }) : res.json({ error });
      },
    );
  } catch (error: unknown) {
    res.json({ error });
  }
});

export default router;
