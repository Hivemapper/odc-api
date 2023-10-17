import { UPLOAD_PATH } from '../config';
import { Router } from 'express';
import { createWriteStream, existsSync, rmSync } from 'fs';
const { execSync } = require('child_process');

const router = Router();

router.post('/', (req, res) => {
  try {
    req.pipe(req.busboy); // Pipe it trough busboy
    const fileSize = req?.query?.fileSize;
    console.log(`From upload route: Uploaded File size: ${fileSize}`);
    req.busboy.on('file', (fieldname, file, data) => {
      const filename = data && data.filename ? data.filename : 'upload.raucb';
      console.log(`Upload of '${filename}' started`);
      // Create a write stream of the new file
      try {
        try {
          if (existsSync(UPLOAD_PATH + filename)) {
            const existingFileSize = parseInt(execSync(`ls -l ${UPLOAD_PATH+filename} | awk '{print $5}'`));
            console.log(`File size is ${existingFileSize} bytes`);
            if (fileSize && typeof fileSize === 'string' && parseInt(fileSize) === existingFileSize) {
              res.json({
                output: 'done',
              });
            }
            rmSync(UPLOAD_PATH + filename)
          }
        } catch (e: unknown) {
          console.log('Failed deleting outdated file during upload');
        }
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