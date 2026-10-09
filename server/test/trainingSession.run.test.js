// Run with: npm test
// Ending, stopping and evaluating a run, with the database replaced by one in-memory session whose
// findOneAndUpdate honours the status filter the way MongoDB does — enough to prove that a double click,
// a retry or a lock landing at the same moment closes a run once and runs what follows once.
const test = require('node:test');
const assert = require('node:assert/strict');

const TrainingSession = require('../src/models/TrainingSession');
const Horse = require('../src/models/Horse');
const User = require('../src/models/User');
const DailyTask = require('../src/models/DailyTask');
const StableAssignment = require('../src/models/StableAssignment');
const ExamRequest = require('../src/models/ExamRequest');
const horseScope = require('../src/utils/horseScope');
const audit = require('../src/modules/audit/audit.service');
const notifications = require('../src/modules/alerts/notification.service');

const calls = { audit: [], owner: [], staff: [], caretaker: [], care: [], exams: [] };
audit.logAction = async (entry) => calls.audit.push(entry);
notifications.pushNotification = async (n) => calls.owner.push(n);
notifications.notifyHorseStaff = async (n) => calls.staff.push(n);
notifications.notifyCaretaker = async (n) => calls.caretaker.push(n);
horseScope.canAccessHorse = async () => true;

let session;
const thenable = (value) => Object.assign(Promise.resolve(value), { select: () => Promise.resolve(value) });
TrainingSession.findById = () => thenable(session);
TrainingSession.findOneAndUpdate = async (filter, update) => {
  // A small pause between the read and the write, so concurrent calls really interleave.
  await new Promise((r) => setImmediate(r));
  if (filter.status && session.status !== filter.status) return null;
  for (const [key, value] of Object.entries(update.$set || {})) {
    if (key.startsWith('metrics.')) session.metrics[key.slice(8)] = value;
    else session[key] = value;
  }
  return session;
};
TrainingSession.updateOne = async (filter, update) => {
  Object.assign(session, update.$set);
  return { modifiedCount: 1 };
};
Horse.findById = () => thenable({ _id: 'h1', name: 'Thunder', owner: 'o1', assignedTrainer: 'u1' });
User.findById = () => thenable({ _id: 'u1', name: 'Trainer An', role: 'head_trainer' });
StableAssignment.findOne = async () => ({ assignedCaretaker: 'g1' });
DailyTask.exists = async (q) => calls.care.some((t) => t.taskType === q.taskType && t.trainingSession === q.trainingSession);
DailyTask.create = async (doc) => calls.care.push(doc);
ExamRequest.exists = async () => calls.exams.length > 0;
ExamRequest.create = async (doc) => {
  calls.exams.push(doc);
  return { _id: 'e1', ...doc };
};

const controller = require('../src/modules/training/trainingSession.controller');
const { closeRun } = require('../src/modules/training/trainingSession.service');

const MIN = 60 * 1000;
function running(overrides = {}) {
  session = {
    _id: 's1',
    horse: 'h1',
    status: 'in_progress',
    kind: 'breeze',
    objective: 'speed',
    intensity: 'high',
    scheduledAt: new Date(Date.now() - 5 * MIN),
    actualStartAt: new Date(Date.now() - 2 * MIN),
    startedBy: 'u1',
    prescription: { distanceM: 800, reps: 1, targetSpeedKmh: 58, targetHeartRateMax: 215 },
    metrics: { distance: 800, maxSpeed: 60, avgHeartRate: 190, sampleCount: 4 },
    ...overrides,
  };
  return session;
}
function call(handler, body = {}) {
  const res = {
    code: 200,
    payload: null,
    status(c) {
      this.code = c;
      return this;
    },
    json(p) {
      this.payload = p;
      return this;
    },
  };
  return handler({ params: { id: 's1' }, body, user: { _id: 'u1', name: 'Trainer An' } }, res, (err) => {
    throw err;
  }).then(() => res);
}

test.beforeEach(() => {
  for (const list of Object.values(calls)) list.length = 0;
});

test('ending a run records the real clock and judges it once, even on a double click', async () => {
  running();
  const [a, b] = await Promise.all([call(controller.endSession), call(controller.endSession)]);
  assert.deepEqual([a.code, b.code].sort(), [200, 409]);
  assert.equal(session.status, 'completed');
  assert.ok(session.actualEndAt instanceof Date);
  assert.ok(Math.abs(session.actualDurationSec - 120) <= 2, `duration ${session.actualDurationSec}`);
  assert.equal(session.outcome.met, true);
  assert.equal(calls.care.length, 2, 'icing and bathing once');
  assert.equal(calls.owner.length, 1, 'the owner is told once');
  assert.equal(calls.audit.filter((e) => e.action === 'trainingSession.end').length, 1);
});

test('the simulator keeps its compressed work apart from the real times', async () => {
  running({ actualStartAt: new Date(Date.now() - 40 * 1000) });
  await closeRun('s1', { to: 'completed', workedSeconds: 240 });
  assert.equal(session.simulatedWorkSec, 240);
  assert.ok(session.actualDurationSec <= 42, 'real duration is the 40 s that passed, not the 4 simulated minutes');
  assert.equal(session.endedBy, null);
});

test('stopping part-way needs a category and a reason, keeps the numbers and asks the vet when the horse is the reason', async () => {
  running({ metrics: { distance: 350, maxSpeed: 41, avgHeartRate: 205, sampleCount: 2 } });
  assert.equal((await call(controller.abortSession, { reason: 'Ngựa khập khiễng' })).code, 400);
  assert.equal((await call(controller.abortSession, { category: 'injury' })).code, 400);
  assert.equal((await call(controller.abortSession, { category: 'medical_lock', reason: 'x' })).code, 400, 'reserved for the lock');

  const res = await call(controller.abortSession, { category: 'injury', reason: 'Ngựa khập khiễng chân trước trái' });
  assert.equal(res.code, 200);
  assert.equal(session.status, 'aborted');
  assert.equal(session.abortCategory, 'injury');
  assert.equal(session.metrics.distance, 350, 'what was measured is kept');
  assert.ok(session.actualEndAt);
  assert.equal(calls.care.length, 0, 'no care-after-work for work not done');
  assert.equal(calls.exams.length, 1);
  assert.equal(calls.exams[0].priority, 'high');
  assert.match(calls.owner[0].message, /dừng buổi .* giữa chừng sau 350 m/);
});

test('a lock landing while the trainer ends the run: one of them wins, the other changes nothing', async () => {
  running();
  const [ended, locked] = await Promise.all([
    call(controller.endSession),
    closeRun('s1', { to: 'aborted', user: { _id: 'v1', name: 'Bác sĩ' }, abortCategory: 'medical_lock', abortReason: 'Viêm gân' }),
  ]);
  const endedWon = ended.code === 200;
  assert.equal(endedWon, locked === null, 'exactly one closed the run');
  assert.equal(session.status, endedWon ? 'completed' : 'aborted');
});

test('a run is never cancelled: the PUT refuses it and points to stopping part-way', async () => {
  running();
  const res = await call(controller.updateSession, { status: 'cancelled' });
  assert.equal(res.code, 409);
  assert.match(res.payload.message, /Dừng giữa chừng/);
  assert.equal(session.status, 'in_progress');
});

test('end refuses a run that is not running, and typed numbers when the sensor already reported', async () => {
  running({ status: 'ready' });
  assert.equal((await call(controller.endSession)).code, 409);
  running();
  assert.equal((await call(controller.endSession, { metrics: { distance: 900 } })).code, 400);
  running({ metrics: { sampleCount: 0 } });
  const res = await call(controller.endSession, { metrics: { distance: 800, maxSpeed: 59, avgHeartRate: 200 } });
  assert.equal(res.code, 200);
  assert.equal(session.metrics.distance, 800, 'typed by hand when no sensor ran');
});

test('evaluation: only a completed run, only rating/comment/video, then a correction is audited', async () => {
  running();
  assert.equal((await call(controller.recordEvaluation, { performanceRating: 8 })).code, 409, 'still running');
  running({ status: 'completed' });
  assert.equal((await call(controller.recordEvaluation, { metrics: { distance: 5000 } })).code, 400, 'numbers are not part of it');
  assert.equal((await call(controller.recordEvaluation, { performanceRating: 11 })).code, 400);

  const first = await call(controller.recordEvaluation, { performanceRating: 8, trainerComment: 'Tốt' });
  assert.equal(first.code, 200);
  assert.equal(session.status, 'evaluated');
  assert.equal(session.evaluatedBy, 'u1');

  const fix = await call(controller.recordEvaluation, { performanceRating: 9 });
  assert.equal(fix.code, 200);
  const corrected = calls.audit.find((e) => e.action === 'trainingSession.evaluation_corrected');
  assert.equal(corrected.metadata.before.performanceRating, 8);
  assert.equal(corrected.metadata.after.performanceRating, 9);
});
