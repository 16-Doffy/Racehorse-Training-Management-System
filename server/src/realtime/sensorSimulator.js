const TrainingSession = require('../models/TrainingSession');
const { evaluateMetrics } = require('./alertEvaluator');
const { getIO } = require('./socketServer');

const TICK_MS = 5000;

function randomInRange(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

/**
 * Stands in for real IoT heart-rate/speed sensors: every tick, generates a plausible reading for
 * each in-progress session, folds it into the session's metrics, broadcasts it live, and runs it
 * through the threshold evaluator. Occasionally spikes a value so the alert path gets exercised.
 *
 * avgHeartRate is a true running mean and distance accumulates from speed, because both are
 * compared against the session's prescription to decide whether it met its target. Overwriting the
 * "average" with the latest reading turned that verdict into a coin toss on the final tick.
 */
function startSensorSimulator() {
  console.log(`[simulator] sensor simulator started (tick every ${TICK_MS}ms)`);

  setInterval(async () => {
    try {
      const sessions = await TrainingSession.find({ status: 'in_progress' })
        .select('horse metrics')
        .populate('horse', 'assignedTrainer');
      if (sessions.length === 0) return;

      const io = getIO();

      for (const session of sessions) {
        const spike = Math.random() < 0.15; // ~15% chance to simulate an overexertion spike
        const heartRate = spike ? randomInRange(182, 205) : randomInRange(90, 170);
        const speed = spike ? randomInRange(72, 85) : randomInRange(30, 65);

        const m = session.metrics;
        const n = m.sampleCount || 0;
        m.avgHeartRate = Math.round((((m.avgHeartRate || 0) * n + heartRate) / (n + 1)) * 10) / 10;
        m.sampleCount = n + 1;
        m.maxHeartRate = Math.max(m.maxHeartRate || 0, heartRate);
        m.maxSpeed = Math.max(m.maxSpeed || 0, speed);
        m.distance = Math.round((m.distance || 0) + (speed / 3.6) * (TICK_MS / 1000));
        // eslint-disable-next-line no-await-in-loop
        await session.save();

        const horseId = session.horse._id;
        // Live readings go to people watching this horse: its owner's horse room and the trainer
        // responsible for it — not every trainer in the club.
        const trainer = session.horse.assignedTrainer;
        io.to([`horse:${horseId}`, trainer ? `user:${trainer}` : 'role:head_trainer']).emit('sensor:reading', {
          sessionId: session._id,
          horseId,
          heartRate,
          speed,
          timestamp: Date.now(),
        });

        // eslint-disable-next-line no-await-in-loop
        await evaluateMetrics({ horseId, sessionId: session._id, heartRate, speed });
      }
    } catch (err) {
      console.error('[simulator] tick failed:', err.message);
    }
  }, TICK_MS);
}

module.exports = { startSensorSimulator };
