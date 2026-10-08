// Run with: npm test
// Exercises the pre-check handler end to end with the database and the services around it replaced,
// so it needs no MongoDB. What it proves: the status rules, the window, the confirmation and the
// readiness handling. It does not prove the real readiness gates (those read the database).
const test = require('node:test');
const assert = require('node:assert/strict');

// Replace the collaborators on the real modules BEFORE the controller is loaded: the controller
// destructures them when it is required.
const readinessService = require('../src/modules/training/readiness.service');
const horseScope = require('../src/utils/horseScope');
const audit = require('../src/modules/audit/audit.service');
const notifications = require('../src/modules/alerts/notification.service');
const TrainingSession = require('../src/models/TrainingSession');

const calls = { audit: [], pushed: [] };
let gates = [];
readinessService.computeReadiness = async () => ({ horse: { _id: 'h1', name: 'Thunder' }, scheduledAt: new Date(), overall: 'x', gates });
horseScope.canAccessHorse = async () => true;
audit.logAction = async (entry) => calls.audit.push(entry);
notifications.pushNotification = async (n) => calls.pushed.push(n);
notifications.notifyCaretaker = async () => {};

const controller = require('../src/modules/training/trainingSession.controller');

const MIN = 60 * 1000;
const gate = (key, status, detail = '') => ({ key, label: key, status, detail });

function fakeSession(overrides = {}) {
  const session = {
    _id: 's1',
    horse: 'h1',
    status: 'scheduled',
    scheduledAt: new Date(Date.now() + 20 * MIN),
    intensity: 'moderate',
    sessionType: 'training',
    objective: 'endurance',
    saved: 0,
    async save() {
      this.saved += 1;
    },
    ...overrides,
  };
  TrainingSession.findById = async () => session;
  return session;
}

function call(handler, body, session) {
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
  const req = { params: { id: 's1' }, body, user: { _id: 'u1', name: 'Trainer An' } };
  return handler(req, res, (err) => {
    throw err;
  }).then(() => res);
}

test.beforeEach(() => {
  calls.audit.length = 0;
  calls.pushed.length = 0;
  gates = [gate('medical', 'ok'), gate('nutrition', 'ok')];
});

test('refuses without the trainer confirming they saw the horse', async () => {
  const session = fakeSession();
  for (const body of [{}, { confirmed: false }, { confirmed: 'true' }]) {
    const res = await call(controller.preCheckSession, body);
    assert.equal(res.code, 400);
    assert.equal(res.payload.data.code, 'PRECHECK_NOT_CONFIRMED');
  }
  assert.equal(session.status, 'scheduled');
  assert.equal(session.saved, 0);
});

test('refuses outside the window around the session time', async () => {
  for (const offsetMin of [3 * 60, -2 * 60]) {
    const session = fakeSession({ scheduledAt: new Date(Date.now() + offsetMin * MIN) });
    const res = await call(controller.preCheckSession, { confirmed: true });
    assert.equal(res.code, 409);
    assert.equal(res.payload.data.code, 'OUTSIDE_PRECHECK_WINDOW');
    assert.ok(res.payload.data.opensAt && res.payload.data.closesAt);
    assert.equal(session.status, 'scheduled');
  }
});

test('only a scheduled or blocked session can be pre-checked', async () => {
  for (const status of ['ready', 'in_progress', 'completed', 'cancelled']) {
    const session = fakeSession({ status });
    const res = await call(controller.preCheckSession, { confirmed: true });
    assert.equal(res.code, 409, status);
    assert.equal(res.payload.data.code, 'INVALID_TRANSITION', status);
    assert.equal(session.status, status);
  }
});

test('passes: the session becomes ready and the confirmation is recorded', async () => {
  const session = fakeSession();
  const res = await call(controller.preCheckSession, { confirmed: true, bodyTempC: 37.8, weather: 'nắng nhẹ', trackCondition: 'khô' });
  assert.equal(res.code, 200);
  assert.equal(session.status, 'ready');
  assert.equal(session.saved, 1);
  assert.equal(session.readiness.confirmedBy, 'u1');
  assert.equal(session.readiness.bodyTempC, 37.8);
  assert.equal(session.readiness.weather, 'nắng nhẹ');
  assert.equal(session.readiness.trackCondition, 'khô');
  assert.equal(calls.audit.at(-1).action, 'trainingSession.pre_check');
  assert.equal(calls.audit.at(-1).metadata.result, 'ready');
});

test('rejects an impossible body temperature', async () => {
  const session = fakeSession();
  const res = await call(controller.preCheckSession, { confirmed: true, bodyTempC: 99 });
  assert.equal(res.code, 400);
  assert.equal(session.status, 'scheduled');
});

test('a medical block makes the session blocked, not ready', async () => {
  gates = [gate('medical', 'blocked', 'Bác sĩ đang khóa huấn luyện: gân gập.'), gate('nutrition', 'ok')];
  const session = fakeSession();
  const res = await call(controller.preCheckSession, { confirmed: true });
  assert.equal(res.code, 409);
  assert.equal(res.payload.data.code, 'READINESS_BLOCKED');
  assert.equal(session.status, 'blocked');
  assert.match(session.blockedReason, /khóa huấn luyện/);
  assert.equal(calls.audit.at(-1).metadata.result, 'blocked');
});

test('a blocked session can be pre-checked again once the block is gone', async () => {
  const session = fakeSession({ status: 'blocked', blockedReason: 'old reason' });
  const res = await call(controller.preCheckSession, { confirmed: true });
  assert.equal(res.code, 200);
  assert.equal(session.status, 'ready');
  assert.equal(session.blockedReason, undefined);
});

test('an amber gate needs a reason and changes nothing until it is given', async () => {
  gates = [gate('medical', 'ok'), gate('nutrition', 'caution', 'Ăn cách giờ tập 30 phút.')];
  const session = fakeSession();

  const refused = await call(controller.preCheckSession, { confirmed: true });
  assert.equal(refused.code, 409);
  assert.equal(refused.payload.data.requiresOverride, true);
  assert.equal(session.status, 'scheduled');
  assert.equal(session.saved, 0);

  const allowed = await call(controller.preCheckSession, { confirmed: true, overrideReason: '  Đã hỏi Groom, ngựa ăn cỏ khô  ' });
  assert.equal(allowed.code, 200);
  assert.equal(session.status, 'ready');
  assert.equal(session.readiness.overrideReason, 'Đã hỏi Groom, ngựa ăn cỏ khô');
  assert.equal(session.readiness.overriddenBy, 'u1');
  assert.equal(calls.pushed.length, 1, 'the Manager is told');
  assert.match(calls.pushed[0].message, /xác nhận sẵn sàng/);
  assert.equal(calls.audit.some((a) => a.action === 'trainingSession.readiness_override'), true);
});

test('a bare status in PUT can never put a session into ready or blocked', async () => {
  for (const status of ['ready', 'blocked', 'evaluated', 'aborted', 'missed']) {
    const session = fakeSession();
    const res = await call(controller.updateSession, { status });
    assert.equal(res.code, 409, status);
    assert.equal(res.payload.data.code, 'INVALID_TRANSITION', status);
    assert.equal(session.status, 'scheduled', status);
  }
});
