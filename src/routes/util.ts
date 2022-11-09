import { Router } from 'express';
import { exec } from 'child_process';
import { CMD } from 'config';

const router = Router();

router.post('/camera/stop', (req, res) => {
  // TBD, done via App for now
  try {
    exec(
      CMD.STOP_CAMERA,
      {
        encoding: 'utf-8',
      },
      (error, stdout, stderr) => {
        if (error) {
          res.json({ error: stdout || stderr });
        } else {
          res.json({
            output: stdout,
          });
        }
      },
    );
  } catch (error: any) {
    res.json({ error: error.stdout || error.stderr });
  }
});

router.post('/camera/start', (req, res) => {
  // TBD, done via App for now
  try {
    exec(
      CMD.START_CAMERA,
      {
        encoding: 'utf-8',
      },
      (error, stdout, stderr) => {
        if (error) {
          res.json({ error: stdout || stderr });
        } else {
          res.json({
            output: stdout,
          });
        }
      },
    );
  } catch (error: any) {
    res.json({ error: error.stdout || error.stderr });
  }
});

router.post('/time/set', (req, res) => {
  const realTime = Number(req.query.ms);
  const timeToSet = new Date(realTime)
    .toISOString()
    .replace(/T/, ' ')
    .replace(/\..+/, '')
    .split(' ');

  try {
    // TBD
    // Delay needed for every step, otherwise it can error out
    // Thankfully not used yet
    exec(
      `timedatectl set-ntp 0 && timedatectl set-time ${timeToSet[0]} && timedatectl set-time ${timeToSet[1]}`,
      {
        encoding: 'utf-8',
      },
      (error, stdout, stderr) => {
        if (error) {
          res.json({ error: stdout || stderr });
        } else {
          res.json({
            output: stdout,
          });
        }
      },
    );
  } catch (error: any) {
    res.json({ error: error.stdout || error.stderr });
  }
});

export default router;
