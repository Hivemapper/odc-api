import { FRAMES_ROOT_FOLDER } from 'config';
import fs from 'fs/promises';
import path from 'path';
import { ICameraFile } from 'types';
import { WebSocketHandler, WebSocketMessage } from 'websockets/types';
import WebSocket from 'ws';
import { getDateFromUnicodeTimestamp } from 'util/index';

interface IMetadata extends ICameraFile {
  name: string;
}

const getLatestJpgFile = async (): Promise<IMetadata | null> => {
  const files = await fs.readdir(FRAMES_ROOT_FOLDER);

  const jpgFiles: IMetadata[] = await Promise.all(
    files
      .filter((filename: string) => filename.endsWith('.jpg'))
      .map(async (filename: string) => {
        const filePath = path.join(FRAMES_ROOT_FOLDER, filename);
        return {
          name: filename,
          path: filePath,
          date: getDateFromUnicodeTimestamp(filename).getTime(),
        };
      }),
  );

  jpgFiles.sort((a, b) => b.date - a.date);

  return jpgFiles.length > 0 ? jpgFiles[0] : null;
};

export const handleLatestImageMetadata: WebSocketHandler = async (
  ws: WebSocket,
) => {
  try {
    const latestJpg = await getLatestJpgFile();

    const message: WebSocketMessage = {
      type: 'latestImageMetadata',
      data: latestJpg
        ? {
            name: latestJpg.name,
            date: latestJpg.date,
          }
        : null,
    };
    console.log('sending metadata', JSON.stringify(message));
    ws.send(JSON.stringify(message));
  } catch (error) {
    console.error('Error retrieving latest image metadata:', error);
    const errorMessage: WebSocketMessage = {
      type: 'error',
      data: 'Failed to retrieve latest image metadata',
    };
    ws.send(JSON.stringify(errorMessage));
  }
};

export const handleLatestImage: WebSocketHandler = async (ws: WebSocket) => {
  try {
    const latestJpg = await getLatestJpgFile();

    if (latestJpg) {
      const imageBuffer = await fs.readFile(latestJpg.path);

      // Then send the binary data
      ws.send(imageBuffer);
    } else {
      const message: WebSocketMessage = {
        type: 'latestImage',
        data: null,
      };
      ws.send(JSON.stringify(message));
    }
  } catch (error) {
    console.error('Error retrieving latest image:', error);
    const errorMessage: WebSocketMessage = {
      type: 'error',
      data: 'Failed to retrieve latest image',
    };
    ws.send(JSON.stringify(errorMessage));
  }
};
