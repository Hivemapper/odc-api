import WebSocket from 'ws';

export type WebSocketHandler = (ws: WebSocket) => void;

export interface WebSocketMessage {
  type: string;
  data: any;
}
