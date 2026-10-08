// Run with: npm test
// Exercises the pre-check and start handlers end to end with the database and the services around it replaced,
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

let otherRunning = false;
const fakeSessions = { last: null };

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
  // What start uses: "does the horse already have a running session" and the claim by status.
  TrainingSession.exists = async () => otherRunning;
  TrainingSession.findOneAndUpdate = async (filter, update) => {
    if (session.status !== filter.status) return null;
    Object.assign(session, update.$set);
    session.claimedAt = update.$set.actualStartAt;
    return session;
  };
  fakeSessions.last = session;
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
  otherRunning = false;
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
  for (const status of ['in_progress', 'completed', 'cancelled']) {
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

test('a ready session can be pre-checked again to refresh a stale pre-check', async () => {
  const session = fakeSession({ status: 'ready', readiness: { checkedAt: new Date(Date.now() - 5 * 60 * MIN) } });
  const res = await call(controller.preCheckSession, { confirmed: true });
  assert.equal(res.code, 200);
  assert.equal(session.status, 'ready');
  assert.ok(Date.now() - new Date(session.readiness.checkedAt).getTime() < 5000);
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

test('a bare status in PUT can never put a session into ready, blocked or in_progress', async () => {
  for (const status of ['ready', 'blocked', 'in_progress', 'evaluated', 'aborted', 'missed']) {
    const session = fakeSession();
    const res = await call(controller.updateSession, { status });
    assert.equal(res.code, 409, status);
    assert.equal(res.payload.data.code, 'INVALID_TRANSITION', status);
    assert.equal(session.status, 'scheduled', status);
  }
});

// ------------------------------------------------------------------ start

const readySession = (overrides = {}) =>
  fakeSession({ status: 'ready', readiness: { checkedAt: new Date(Date.now() - 10 * MIN), confirmedBy: 'u1', bodyTempC: 37.5, weather: 'nắng' }, ...overrides });

test('start refuses a session that has not been pre-checked', async () => {
  for (const status of ['scheduled', 'blocked']) {
    const session = fakeSession({ status });
    const res = await call(controller.startSession, {});
    assert.equal(res.code, 409, status);
    assert.equal(res.payload.data.code, 'NOT_READY', status);
    assert.equal(session.status, status);
    assert.equal(session.actualStartAt, undefined);
  }
});

test('start refuses finished sessions with INVALID_TRANSITION', async () => {
  for (const status of ['in_progress', 'completed', 'cancelled']) {
    const session = fakeSession({ status });
    const res = await call(controller.startSession, {});
    assert.equal(res.code, 409, status);
    assert.equal(res.payload.data.code, 'INVALID_TRANSITION', status);
  }
});

test('start refuses a pre-check older than two hours', async () => {
  const session = readySession({ readiness: { checkedAt: new Date(Date.now() - 3 * 60 * MIN) } });
  const res = await call(controller.startSession, {});
  assert.equal(res.code, 409);
  assert.equal(res.payload.data.code, 'PRECHECK_EXPIRED');
  assert.equal(session.status, 'ready');
  assert.equal(session.actualStartAt, undefined);
});

test('start refuses when the horse already has a running session', async () => {
  otherRunning = true;
  const session = readySession();
  const res = await call(controller.startSession, {});
  assert.equal(res.code, 409);
  assert.equal(res.payload.data.code, 'ANOTHER_SESSION_RUNNING');
  assert.equal(session.status, 'ready');
});

test('start: the session runs and the server stamps the start time', async () => {
  const session = readySession();
  const before = Date.now();
  const res = await call(controller.startSession, {});
  assert.equal(res.code, 200);
  assert.equal(session.status, 'in_progress');
  assert.ok(session.actualStartAt instanceof Date);
  assert.ok(session.actualStartAt.getTime() >= before && session.actualStartAt.getTime() <= Date.now());
  assert.equal(session.actualEndAt, undefined, 'an end time must not exist before the session ends');
  // what the pre-check recorded survives the new readiness snapshot
  assert.equal(session.readiness.confirmedBy, 'u1');
  assert.equal(session.readiness.bodyTempC, 37.5);
  assert.equal(session.readiness.weather, 'nắng');
  assert.equal(calls.audit.at(-1).action, 'trainingSession.start');
});

test('start ignores a start time sent by the client', async () => {
  const session = readySession();
  const res = await call(controller.startSession, { actualStartAt: '2020-01-01T00:00:00Z' });
  assert.equal(res.code, 200);
  assert.ok(session.actualStartAt.getFullYear() >= 2026);
});

test('a horse locked since the pre-check: start is refused and the session is blocked', async () => {
  gates = [gate('medical', 'blocked', 'Bác sĩ đang khóa huấn luyện: viêm gân.'), gate('nutrition', 'ok')];
  const session = readySession();
  const res = await call(controller.startSession, {});
  assert.equal(res.code, 409);
  assert.equal(res.payload.data.code, 'READINESS_BLOCKED');
  assert.equal(session.status, 'blocked');
  assert.equal(session.actualStartAt, undefined);
  assert.equal(calls.audit.at(-1).action, 'trainingSession.start');
});

test('start with an amber gate needs a reason, then runs and tells the Manager', async () => {
  gates = [gate('medical', 'ok'), gate('nutrition', 'caution', 'Ăn cách giờ tập 20 phút.')];
  const session = readySession();

  const refused = await call(controller.startSession, {});
  assert.equal(refused.code, 409);
  assert.equal(refused.payload.data.requiresOverride, true);
  assert.equal(session.status, 'ready');

  const allowed = await call(controller.startSession, { overrideReason: 'Đã đợi thêm, ngựa ổn' });
  assert.equal(allowed.code, 200);
  assert.equal(session.status, 'in_progress');
  assert.equal(session.readiness.overrideReason, 'Đã đợi thêm, ngựa ổn');
  assert.equal(calls.pushed.length, 1);
  assert.match(calls.pushed[0].message, /bắt đầu/);
});

test('a second start of the same session is refused (double click)', async () => {
  const session = readySession();
  const first = await call(controller.startSession, {});
  assert.equal(first.code, 200);
  const second = await call(controller.startSession, {});
  assert.equal(second.code, 409);
  assert.equal(session.status, 'in_progress');
});
