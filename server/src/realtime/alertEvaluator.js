const Horse = require('../models/Horse');
const { ROLES } = require('../constants/roles');
const { pushNotification } = require('../modules/alerts/notification.service');

// Simple fixed thresholds for the demo. A later phase can make these per-horse/per-phase.
const THRESHOLDS = {
  maxHeartRate: 180, // bpm — sustained above this suggests overexertion risk
  maxSpeed: 70, // km/h — above this on a training gallop is flagged for review
};

// The sensor simulator ticks every 5s and can roll a spike on ~15% of ticks, which without a
// cooldown floods the Head Trainer with a near-duplicate notification every 30-75s for the same
// horse while it's still over threshold. One process-lifetime map is enough for this single-node
// demo deployment — it just needs to survive between ticks, not across restarts.
const COOLDOWN_MS = 3 * 60 * 1000;
const lastAlertedAt = new Map();

/**
 * Compares a live metrics reading against fitness thresholds. When exceeded, persists a
 * Notification and pushes it in realtime to the Head Trainer and to the horse's owner — at most
 * once per horse per COOLDOWN_MS, even if the condition keeps recurring across ticks.
 */
async function evaluateMetrics({ horseId, sessionId, heartRate, speed }) {
  const exceeded = [];
  if (heartRate > THRESHOLDS.maxHeartRate) exceeded.push(`nhịp tim ${heartRate} bpm`);
  if (speed > THRESHOLDS.maxSpeed) exceeded.push(`tốc độ ${speed} km/h`);

  if (exceeded.length === 0) return null;

  const key = String(horseId);
  const last = lastAlertedAt.get(key);
  if (last && Date.now() - last < COOLDOWN_MS) return null;
  lastAlertedAt.set(key, Date.now());

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
