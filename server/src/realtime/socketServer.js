const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { jwtSecret, clientOrigins } = require('../config/env');
const Horse = require('../models/Horse');

let io = null;

/** Attaches Socket.io to the HTTP server and authenticates each connection via its JWT. */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: clientOrigins, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing auth token'));
    try {
      socket.user = jwt.verify(token, jwtSecret);
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', async (socket) => {
    const { id, role } = socket.user;
    socket.join(`role:${role}`);
    socket.join(`user:${id}`);

    // Owners also join a room per horse they own, so alerts can target "everyone watching this horse".
    const owned = await Horse.find({ owner: id }).select('_id');
    owned.forEach((h) => socket.join(`horse:${h._id}`));

    console.log(`[socket] connected: user=${id} role=${role}`);
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io not initialized yet. Call initSocket(httpServer) first.');
  return io;
}

module.exports = { initSocket, getIO };
