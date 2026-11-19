// Verifies multi-segment sessions keep segments & endAt on createSession and run sequentially in targetsOf. No MongoDB.
const test = require('node:test');
const assert = require('node:assert/strict');
const TrainingSession = require('../src/models/TrainingSession');
const TrainingPlan = require('../src/models/TrainingPlan');
const Horse = require('../src/models/Horse');
const readiness = require('../src/modules/training/readiness.service');
const scope = require('../src/utils/horseScope');
const audit = require('../src/modules/audit/audit.service');
const notifications = require('../src/modules/alerts/notification.service');

const ids = {
  horse: '64b000000000000000000011',
  plan: '64b000000000000000000012',
  user: '64b000000000000000000013',
};

let createdDocs = [];

scope.canAccessHorse = async () => true;
readiness.computeReadiness = async () => ({
  horse: { _id: ids.horse, name: 'Demo Horse' },
  overall: 'ready',
  gates: [{ key: 'medical', status: 'ok' }],
});
audit.logAction = async () => {};
notifications.pushNotification = async () => {};
notifications.notifyCaretaker = async () => {};
notifications.notifyHorseStaff = async () => {};
TrainingPlan.findById = async () => ({ _id: ids.plan, horse: ids.horse, status: 'active' });
Horse.findById = () => ({ select: async () => ({ name: 'Demo Horse' }) });
TrainingSession.exists = async () => false;
// The horse has nothing else booked that day (sessionDay.js reads its other sessions).
TrainingSession.find = () => ({ select: () => ({ lean: async () => [] }) });
TrainingSession.create = async (body) => {
  const doc = new TrainingSession(body);
  createdDocs.push(doc.toObject());
  return doc;
};

const controller = require('../src/modules/training/trainingSession.controller');
const { targetsOf } = require('../src/realtime/sensorSimulator');

async function callCreate(body) {
  const res = {
    code: 200,
    status(c) {
      this.code = c;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  await controller.createSession({ params: {}, body, user: { _id: ids.user, name: 'HLV' } }, res, (err) => {
    throw err;
  });
  return res;
}

test.beforeEach(() => {
  createdDocs = [];
});

test('createSession preserves segments and computes endAt from total segment duration, then targetsOf steps sequentially', async () => {
  const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  scheduledAt.setHours(9, 0, 0, 0);

  const res = await callCreate({
    horse: ids.horse,
    trainingPlan: ids.plan,
    kind: 'canter',
    scheduledAt: scheduledAt.toISOString(),
    segments: [
      { kind: 'canter', durationMinutes: 20, distanceM: 2400, note: 'Bài chính' },
      { kind: 'walk', durationMinutes: 15, note: 'Thả lỏng / bổ sung' },
    ],
  });

  assert.equal(res.code, 201);
  assert.equal(createdDocs.length, 1);

  const saved = createdDocs[0];
  assert.equal(saved.segments.length, 2);
  assert.equal(saved.segments[0].kind, 'canter');
  assert.equal(saved.segments[0].distanceM, 2400);
  assert.equal(saved.segments[1].kind, 'walk');
  assert.equal(saved.segments[1].durationMinutes, 15);

  const plannedMinutes = Math.round((new Date(saved.endAt).getTime() - new Date(saved.scheduledAt).getTime()) / 60000);
  assert.equal(plannedMinutes, 35);
  assert.equal(saved.prescription.durationMinutes, 35);
  assert.equal(saved.prescription.distanceM, 2400);

  const seg0 = targetsOf(saved, 0);
  assert.equal(seg0.isSegmented, true);
  assert.equal(seg0.segmentCount, 2);
  assert.equal(seg0.currentSegmentIndex, 0);
  assert.equal(seg0.segmentKind, 'canter');
  assert.equal(seg0.speed, 35);
  assert.ok(seg0.distance > 2400);

  const seg1 = targetsOf(saved, 2400);
  assert.equal(seg1.currentSegmentIndex, 1);
  assert.equal(seg1.segmentKind, 'walk');
  assert.equal(seg1.speed, 12);
  assert.equal(seg1.segmentNote, 'Thả lỏng / bổ sung');
});

test('evaluateSegmentOutcomes and computeOutcome calculate per-segment stats and cool-down HR drop', () => {
  const { evaluateSegmentOutcomes } = require('../src/realtime/segmentTimeline');
  const { computeOutcome } = require('../src/modules/training/trainingSession.service');

  const segments = [
    { kind: 'canter', durationMinutes: 20, distanceM: 2400, note: 'Bài chính' },
    { kind: 'walk', durationMinutes: 10, distanceM: 800, note: 'Thả lỏng' },
  ];
  const trace = [
    { distance: 800, speed: 34, hr: 158 },
    { distance: 2400, speed: 36, hr: 166 },
    { distance: 2800, speed: 12, hr: 122 },
    { distance: 3200, speed: 11, hr: 106 },
  ];

  const perSeg = evaluateSegmentOutcomes(segments, trace, { distance: 3200 });
  assert.equal(perSeg.length, 2);
  assert.equal(perSeg[0].kind, 'canter');
  assert.equal(perSeg[0].actualMaxSpeedKmh, 36);
  assert.equal(perSeg[0].actualAvgHeartRate, 162);
  assert.equal(perSeg[0].met, true);

  assert.equal(perSeg[1].kind, 'walk');
  assert.equal(perSeg[1].actualAvgHeartRate, 114);
  assert.equal(perSeg[1].actualLastHeartRate, 106);
  assert.equal(perSeg[1].recoveryDropBpm, 56);
  assert.equal(perSeg[1].met, true);

  const outcome = computeOutcome({
    prescription: { targetSpeedKmh: 35, targetHeartRateMax: 170, distanceM: 2400 },
    metrics: { maxSpeed: 36, avgHeartRate: 146, distance: 3200 },
    segments,
    trace,
  });
  assert.equal(outcome.met, true);
  assert.equal(outcome.segmentResults.length, 2);
  assert.equal(outcome.segmentResults[1].recoveryDropBpm, 56);
});
