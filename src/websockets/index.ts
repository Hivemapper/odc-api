import WebSocket from 'ws';
import { Server } from 'http';
import { handleDashcamInfo } from './handlers/dashcam';
import { handleMetadataList } from './handlers/metadata';
import { WebSocketMessage } from './types';
import { handleLatestImage } from './handlers/preview';

const handleMessage = (ws: WebSocket, message: WebSocket.Data) => {
  if (typeof message === 'string') {
    console.log('Received text message:', message);
    try {
      const parsedMessage: WebSocketMessage = JSON.parse(message);
      switch (parsedMessage.type) {
        case 'requestLatestImage':
          handleLatestImage(ws);
          break;
        // Add other message type handlers here
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  } else {
    console.log('Received binary message');
  }
};

const handleConnection = (ws: WebSocket) => {
  console.log('Client connected');

  // Send dahscam info and metadata list to the client as soon as they connect
  handleDashcamInfo(ws);
  handleMetadataList(ws);

  ws.on('message', handleMessage);
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
