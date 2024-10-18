import WebSocket from 'ws';
import { Server } from 'http';
import { handleDashcamInfo } from './handlers/dashcam';
import { handleMetadataList } from './handlers/metadata';
import {
  handleLatestImage,
  handleLatestImageMetadata,
} from './handlers/imageViewer';

const handleMessage = (ws: WebSocket, message: WebSocket.Data) => {
  if (Buffer.isBuffer(message)) {
    const messageString = message.toString();
    console.log('Received message as string:', messageString);

    let parsedMessage;
    try {
      parsedMessage = JSON.parse(messageString);
      console.log('Parsed message:', parsedMessage);
    } catch (error) {
      console.error('Failed to parse message:', error);
      return;
    }

    switch (parsedMessage.type) {
      case 'getLatestImageMetadata':
        handleLatestImageMetadata(ws);
        break;
      case 'getLatestImage':
        handleLatestImage(ws);
        break;
      default:
        console.log('Unknown message type:', parsedMessage.type);
    }
  } else {
    console.log('Received non-buffer message type');
  }
};

const handleConnection = (ws: WebSocket) => {
  console.log('Client connected');

  // Send dahscam info and metadata list to the client as soon as they connect
  handleDashcamInfo(ws);
  handleMetadataList(ws);

  ws.on('message', (message: string) => {
    handleMessage(ws, message);
  });
  ws.on('close', () => console.log('Client disconnected'));
};

let wss: WebSocket.Server | null = null;

export const createWebSocketServer = (server: Server): WebSocket.Server => {
  wss = new WebSocket.Server({ server });
  wss.on('connection', handleConnection);
  console.log('WebSocket created');
  return wss;
};

export const closeWebSocketServer = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!wss) {
      resolve();
      return;
    }

    console.log('Closing WebSocket server...');
    wss.close(err => {
      if (err) {
        console.error('Error closing WebSocket server:', err);
        reject(err);
      } else {
        console.log('WebSocket server closed successfully');
        wss = null;
        resolve();
      }
    });
  });
};
