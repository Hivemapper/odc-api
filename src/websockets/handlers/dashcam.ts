import { makeFrameKmFolder } from 'util/framekm';
import { getDashcamInfo } from 'util/index';
import { WebSocketHandler, WebSocketMessage } from 'websockets/types';
import WebSocket from 'ws';

export const handleDashcamInfo: WebSocketHandler = async (ws: WebSocket) => {
  const dashcamInfo = await getDashcamInfo();
  const message: WebSocketMessage = {
    type: 'dashcamInfo',
    data: dashcamInfo,
  };
  ws.send(JSON.stringify(message));
  await makeFrameKmFolder();
};
