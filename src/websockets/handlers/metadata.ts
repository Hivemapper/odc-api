import { getMetadataFiles } from 'util/framekm';
import { WebSocketHandler, WebSocketMessage } from 'websockets/types';
import WebSocket from 'ws';

export const handleMetadataList: WebSocketHandler = async (ws: WebSocket) => {
  try {
    const metadataFiles = await getMetadataFiles();
    const message: WebSocketMessage = {
      type: 'metadata',
      data: metadataFiles,
    };
    ws.send(JSON.stringify(message));
  } catch (error) {
    console.error('Error sending metadata:', error);
    const errorMessage: WebSocketMessage = {
      type: 'error',
      data: 'Failed to retrieve metadata',
    };
    ws.send(JSON.stringify(errorMessage));
  }
};
