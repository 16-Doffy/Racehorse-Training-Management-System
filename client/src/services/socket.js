import { io } from 'socket.io-client';

let socket = null;

/**
 * Socket.IO service connecting to import.meta.env.VITE_SOCKET_URL with JWT auth token.
 * 
 * Known backend server events:
 * - 'care:due'        -> payload: { notification, horseId, item } (fired by careScheduler when vaccination, deworming, or farrier is due)
 * - 'fitness:alert'   -> payload: { notification, horseId, sessionId, heartRate, speed } (fired by alertEvaluator on heartRate/speed spikes)
 * - 'sensor:reading'  -> payload: { sessionId, horseId, heartRate, speed, timestamp } (realtime live metric readings)
 */
export function getSocket() {
  const token = localStorage.getItem('token');
  if (!token) return null;

  if (!socket || !socket.connected) {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (s && !s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
