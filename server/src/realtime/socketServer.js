const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { jwtSecret, clientOrigins } = require('../config/env');
const Horse = require('../models/Horse');
const User = require('../models/User');

let io = null;

/** Attaches Socket.io to the HTTP server and authenticates each connection via its JWT. */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: clientOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing auth token'));
    try {
      const { id } = jwt.verify(token, jwtSecret);
      // As `protect` does for REST: a blocked account stays out, and the role is the one it has now.
      const user = await User.findById(id).select('role isActive').lean();
      if (!user || !user.isActive) return next(new Error('Account is not active'));
      socket.user = { id: String(user._id), role: user.role };
      return next();
    } catch (err) {
      return next(new Error('Invalid or expired token'));
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

/** Closes an account's open connections: it was blocked, or its role changed. No socket server (a script, a test): nothing to do. */
function closeUserSockets(userId) {
  if (io) io.in(`user:${userId}`).disconnectSockets(true);
}

/** An owner's open screens follow a horse that changes hands, without waiting for the next connection. */
function moveHorseRoom(horseId, fromOwner, toOwner) {
  if (!io) return;
  if (fromOwner) io.in(`user:${fromOwner}`).socketsLeave(`horse:${horseId}`);
  if (toOwner) io.in(`user:${toOwner}`).socketsJoin(`horse:${horseId}`);
}

module.exports = { initSocket, getIO, closeUserSockets, moveHorseRoom };
