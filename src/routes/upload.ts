import { UPLOAD_PATH } from '../config';
import { Router } from 'express';
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync } from 'fs';
const { execSync } = require('child_process');

const router = Router();
let fileSize: string | undefined;

router.post('/', (req, res) => {
  try {
    req.pipe(req.busboy); // Pipe it trough busboy

    req.busboy.on('field', (fieldname, file, data) => {
      console.log(`Size of upload file is ${file}`);
      fileSize = file;
    });
    req.busboy.on('file', (fieldname, file, data) => {
      const filename = data && data.filename ? data.filename : 'upload.raucb';
      console.log(`Upload of '${filename}' started`);
      const uploadFilePath = UPLOAD_PATH + filename;
      // Create a write stream of the new file
      try {
        if (existsSync(uploadFilePath)) {
          const stat = statSync(uploadFilePath);

          //Check if file is already existing and has the same size
          if (fileSize && typeof fileSize === 'string' && stat && parseInt(fileSize) === stat.size) {
            res.json({
              output: 'done',
            });
            return;
          }
          else {
            rmSync(uploadFilePath);
          }
        }
        const fstream = createWriteStream(uploadFilePath);
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
        console.log('Error from upload route', e);
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
