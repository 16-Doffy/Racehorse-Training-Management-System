const TrainingSession = require('../models/TrainingSession');
const { evaluateMetrics } = require('./alertEvaluator');
const { getIO } = require('./socketServer');
const { SESSION_KINDS } = require('../constants/training');
const { autoComplete } = require('../modules/training/trainingSession.service');

const TICK_MS = 5000;
// Each 5-second tick stands for 30 seconds of work, so a 2400 m canter finishes in under a minute
// of demo time and a 4 km walk in about three.
const SIM_SECONDS_PER_TICK = 30;
// Chance per tick of a reading over the session's heart-rate ceiling, so the alert path still shows.
const SPIKE_CHANCE = 0.1;
// Used for a session with no workout and no kind (sessions booked before kinds existed).
const FALLBACK = { targetSpeedKmh: 35, targetHeartRateMax: 180, distanceM: 2000, reps: 1 };

// How well each running session's horse is going today: some days a horse holds its target pace,
// some days it doesn't, which is what makes "Đạt / Chưa đạt" mean something. Per process is enough.
const formOfSession = new Map();

const jitter = (value, spread) => value * (1 - spread + Math.random() * 2 * spread);
const round1 = (n) => Math.round(n * 10) / 10;

/** The workout a running session is measured against: its prescription, else its kind's, else a canter. */
function targetsOf(session) {
  const kind = SESSION_KINDS[session.kind]?.prescription || {};
  const p = session.prescription || {};
  const pick = (f) => p[f] ?? kind[f] ?? FALLBACK[f];
  return {
    speed: pick('targetSpeedKmh'),
    heartRateMax: pick('targetHeartRateMax'),
    distance: (pick('distanceM') || FALLBACK.distanceM) * (p.reps ?? kind.reps ?? 1),
    durationMinutes: p.durationMinutes ?? kind.durationMinutes ?? null,
  };
}

/**
 * Stands in for real IoT heart-rate/speed sensors: every tick, generates a reading for each
 * in-progress session around what its workout asks for, folds it into the session's metrics,
 * broadcasts it live and runs it through the threshold evaluator. When the workout is covered
 * (its distance, or its duration for a timed one) the session is completed on its own.
 *
 * avgHeartRate is a true running mean; distance accumulates from speed and never runs past the
 * workout — the feed used to keep adding distance for as long as nobody closed the session.
 */
function startSensorSimulator() {
  console.log(`[simulator] sensor simulator started (tick every ${TICK_MS}ms, ${SIM_SECONDS_PER_TICK}s of work per tick)`);

  setInterval(async () => {
    try {
      const sessions = await TrainingSession.find({ status: 'in_progress' }).populate('horse', 'assignedTrainer');
      if (sessions.length === 0) return;

      const io = getIO();

      for (const session of sessions) {
        const target = targetsOf(session);
        const key = String(session._id);
        if (!formOfSession.has(key)) formOfSession.set(key, 0.9 + Math.random() * 0.15); // 90–105% of target pace
        const form = formOfSession.get(key);

        const spike = Math.random() < SPIKE_CHANCE;
        const speed = round1(jitter(target.speed * form, 0.06));
        const heartRate = Math.round(spike ? jitter(target.heartRateMax * 1.06, 0.03) : jitter(target.heartRateMax * 0.86, 0.06));

        const m = session.metrics;
        const n = m.sampleCount || 0;
        m.avgHeartRate = round1(((m.avgHeartRate || 0) * n + heartRate) / (n + 1));
        m.sampleCount = n + 1;
        m.maxHeartRate = Math.max(m.maxHeartRate || 0, heartRate);
        m.maxSpeed = Math.max(m.maxSpeed || 0, speed);
        m.distance = Math.min(target.distance, Math.round((m.distance || 0) + (speed / 3.6) * SIM_SECONDS_PER_TICK));
        const elapsedMinutes = (m.sampleCount * SIM_SECONDS_PER_TICK) / 60;
        const done = m.distance >= target.distance || (target.durationMinutes && elapsedMinutes >= target.durationMinutes);
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
          distance: m.distance,
          targetDistance: target.distance,
          timestamp: Date.now(),
        });

        // eslint-disable-next-line no-await-in-loop
        await evaluateMetrics({ horseId, sessionId: session._id, heartRate, speed });

        if (done) {
          formOfSession.delete(key);
          // eslint-disable-next-line no-await-in-loop
          await autoComplete(session, { workedSeconds: m.sampleCount * SIM_SECONDS_PER_TICK });
          io.to([`horse:${horseId}`, trainer ? `user:${trainer}` : 'role:head_trainer']).emit('session:completed', { sessionId: session._id, horseId });
        }
      }
    } catch (err) {
      console.error('[simulator] tick failed:', err.message);
    }
  }, TICK_MS);
}

module.exports = { startSensorSimulator, targetsOf };
