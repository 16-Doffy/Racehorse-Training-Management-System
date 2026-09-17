const Horse = require('../models/Horse');
const { ROLES } = require('../constants/roles');
const { pushNotification } = require('../modules/alerts/notification.service');

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
  if (heartRate > THRESHOLDS.maxHeartRate) exceeded.push(`nhịp tim ${heartRate} bpm`);
  if (speed > THRESHOLDS.maxSpeed) exceeded.push(`tốc độ ${speed} km/h`);

  if (exceeded.length === 0) return null;

  const horse = await Horse.findById(horseId).select('name');
  const horseName = horse?.name || 'Ngựa';
  const message = `${horseName} vượt ngưỡng thể lực (${exceeded.join(', ')}) trong buổi tập đang diễn ra.`;

  return pushNotification({
    recipientRole: ROLES.HEAD_TRAINER,
    horse: horseId,
    type: 'fitness_alert',
    severity: 'warning',
    message,
    extraRooms: [`horse:${horseId}`],
  });
}

module.exports = { evaluateMetrics, THRESHOLDS };
