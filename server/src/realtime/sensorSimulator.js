const TrainingSession = require('../models/TrainingSession');
const { evaluateMetrics } = require('./alertEvaluator');
const { getIO } = require('./socketServer');

const TICK_MS = 5000;

function randomInRange(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

/**
 * Stands in for real IoT heart-rate/speed sensors: every tick, generates a plausible reading for
 * each in-progress session, persists it onto the session's metrics, broadcasts it live, and runs
 * it through the threshold evaluator. Occasionally spikes a value so the alert path gets exercised.
 */
function startSensorSimulator() {
  console.log(`[simulator] sensor simulator started (tick every ${TICK_MS}ms)`);

  setInterval(async () => {
    try {
      const sessions = await TrainingSession.find({ status: 'in_progress' }).select('horse metrics');
      if (sessions.length === 0) return;

      const io = getIO();

      for (const session of sessions) {
        const spike = Math.random() < 0.15; // ~15% chance to simulate an overexertion spike
        const heartRate = spike ? randomInRange(182, 205) : randomInRange(90, 170);
        const speed = spike ? randomInRange(72, 85) : randomInRange(30, 65);

        session.metrics.avgHeartRate = heartRate;
        session.metrics.maxHeartRate = Math.max(session.metrics.maxHeartRate || 0, heartRate);
        session.metrics.maxSpeed = Math.max(session.metrics.maxSpeed || 0, speed);
        await session.save();

        io.to(`horse:${session.horse}`).to('role:head_trainer').emit('sensor:reading', {
          sessionId: session._id,
          horseId: session.horse,
          heartRate,
          speed,
          timestamp: Date.now(),
        });

        await evaluateMetrics({ horseId: session.horse, sessionId: session._id, heartRate, speed });
      }
    } catch (err) {
      console.error('[simulator] tick failed:', err.message);
    }
  }, TICK_MS);
}

module.exports = { startSensorSimulator };
