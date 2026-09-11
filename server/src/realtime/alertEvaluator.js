const Notification = require('../models/Notification');
const { getIO } = require('./socketServer');
const { ROLES } = require('../constants/roles');

// Simple fixed thresholds for the demo. A later phase can make these per-horse/per-phase.
const THRESHOLDS = {
  maxHeartRate: 180, // bpm — sustained above this suggests overexertion risk
  maxSpeed: 70, // km/h — above this on a training gallop is flagged for review
};

/**
 * Compares a live metrics reading against fitness thresholds. When exceeded, persists a
 * Notification and pushes it in realtime to the Head Trainer and to the horse's owner.
 */
async function evaluateMetrics({ horseId, sessionId, heartRate, speed }) {
  const exceeded = [];
  if (heartRate > THRESHOLDS.maxHeartRate) exceeded.push(`heart rate ${heartRate} bpm`);
  if (speed > THRESHOLDS.maxSpeed) exceeded.push(`speed ${speed} km/h`);

  if (exceeded.length === 0) return null;

  const message = `Fitness threshold exceeded (${exceeded.join(', ')}) during session ${sessionId}.`;
  const notification = await Notification.create({
    recipientRole: ROLES.HEAD_TRAINER,
    horse: horseId,
    type: 'fitness_alert',
    severity: 'warning',
    message,
  });

  const io = getIO();
  io.to(`role:${ROLES.HEAD_TRAINER}`).to(`horse:${horseId}`).emit('fitness:alert', {
    notification,
    horseId,
    sessionId,
    heartRate,
    speed,
  });

  return notification;
}

module.exports = { evaluateMetrics, THRESHOLDS };
