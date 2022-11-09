import { UPLOAD_PATH } from '../config';
import { Router } from 'express';
import { createWriteStream } from 'fs';

const router = Router();

router.post('/', (req, res) => {
  try {
    req.pipe(req.busboy); // Pipe it trough busboy

    req.busboy.on('file', (fieldname, file, data) => {
      const filename = data && data.filename ? data.filename : 'upload.raucb';
      console.log(`Upload of '${filename}' started`);
      // Create a write stream of the new file
      try {
        const fstream = createWriteStream(UPLOAD_PATH + filename);
        // Pipe it trough
        file.pipe(fstream);

        // On finish of the upload
        fstream.on('close', () => {
          console.log(`Upload of '${filename}' finished`);
          res.json({
            output: 'done',
          });
        });
      } catch (e: unknown) {
        console.log(e);
        res.json({
          error: e,
        });
      }
    });
  } catch (e: unknown) {
    console.log(e);
    res.json({
      error: e,
    });
  }
});

export default router;
