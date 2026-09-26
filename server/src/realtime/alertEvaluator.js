const Horse = require('../models/Horse');
const TrainingSession = require('../models/TrainingSession');
const { notifyHorseStaff } = require('../modules/alerts/notification.service');
const { OBJECTIVE_LABELS } = require('../constants/training');

// Club-wide safety ceiling, used when the session didn't prescribe its own limits.
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
 *
 * Thresholds come from the session's own prescription where one exists, falling back to the
 * club-wide ceiling. A fixed 180 bpm can't tell the difference between a sprint, where that is
 * the point, and a recovery trot, where it means something is wrong.
 */
async function evaluateMetrics({ horseId, sessionId, heartRate, speed }) {
  const session = sessionId
    ? await TrainingSession.findById(sessionId).select('objective prescription')
    : null;

  const limits = {
    maxHeartRate: session?.prescription?.targetHeartRateMax ?? THRESHOLDS.maxHeartRate,
    maxSpeed: session?.prescription?.targetSpeedKmh ?? THRESHOLDS.maxSpeed,
  };

  const exceeded = [];
  if (heartRate > limits.maxHeartRate) exceeded.push(`nhịp tim ${heartRate}/${limits.maxHeartRate} bpm`);
  if (speed > limits.maxSpeed) exceeded.push(`tốc độ ${speed}/${limits.maxSpeed} km/h`);

  if (exceeded.length === 0) return null;

  const key = String(horseId);
  const last = lastAlertedAt.get(key);
  if (last && Date.now() - last < COOLDOWN_MS) return null;
  lastAlertedAt.set(key, Date.now());

  const horse = await Horse.findById(horseId).select('name');
  const horseName = horse?.name || 'Ngựa';
  const context = session?.objective ? ` (buổi "${OBJECTIVE_LABELS[session.objective] || session.objective}")` : '';
  const message = `${horseName} vượt ngưỡng thể lực (${exceeded.join(', ')}) trong buổi tập đang diễn ra${context}.`;

  // The trainer responsible for this horse (all trainers only if nobody is assigned), plus the
  // owner through the horse's room.
  return notifyHorseStaff({
    staff: 'trainer',
    horse: horseId,
    trainingSession: sessionId || undefined,
    type: 'fitness_alert',
    severity: 'warning',
    message,
    extraRooms: [`horse:${horseId}`],
  });
}

module.exports = { evaluateMetrics, THRESHOLDS };
