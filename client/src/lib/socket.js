import { io } from 'socket.io-client';

let socket = null;

/** Lazily creates a single authenticated socket connection, reused across the app. */
export function getSocket() {
  const token = localStorage.getItem('token');
  if (!token) return null;

  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      auth: { token },
      autoConnect: false,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
