import { FRAMES_ROOT_FOLDER } from 'config';
import fs from 'fs/promises';
import path from 'path';
import { ICameraFile } from 'types';
import { getDateFromUnicodeTimestamp } from '../../util';
import { WebSocketHandler } from 'websockets/types';
import WebSocket from 'ws';

export const handleLatestImage: WebSocketHandler = async (ws: WebSocket) => {
  try {
    const files = await fs.readdir(FRAMES_ROOT_FOLDER);

    const jpgFiles: ICameraFile[] = files
      .filter((filename: string) => filename.endsWith('.jpg'))
      .map(filename => ({
        path: filename,
        date: getDateFromUnicodeTimestamp(filename).getTime(),
      }))
      .sort((a, b) => b.date - a.date); // Sort in descending order (latest first)

    if (jpgFiles.length > 0) {
      const latestJpg = jpgFiles[0];
      const filePath = path.join(FRAMES_ROOT_FOLDER, latestJpg.path);

      try {
        const imageBuffer = await fs.readFile(filePath);

        ws.send(
          JSON.stringify({
            type: 'latestImageMetadata',
            data: {
              path: latestJpg.path,
              date: latestJpg.date,
              size: imageBuffer.length,
            },
          }),
        );

        ws.send(imageBuffer);
      } catch (readError) {
        console.error('Error reading image file:', readError);
        ws.send(
          JSON.stringify({
            type: 'error',
            data: 'Failed to read image file',
          }),
        );
      }
    } else {
      ws.send(
        JSON.stringify({
          type: 'error',
          data: 'No JPG files found',
        }),
      );
    }
  } catch (error) {
    console.error('Error retrieving latest image:', error);
    ws.send(
      JSON.stringify({
        type: 'error',
        data: 'Failed to retrieve latest image',
      }),
    );
  }
};
