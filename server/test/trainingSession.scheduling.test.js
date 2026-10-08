// The real handlers and missed-session job, with persistence/notifications replaced. No MongoDB.
const test = require('node:test');
const assert = require('node:assert/strict');
const TrainingSession = require('../src/models/TrainingSession');
const TrainingPlan = require('../src/models/TrainingPlan');
const Horse = require('../src/models/Horse');
const readiness = require('../src/modules/training/readiness.service');
const scope = require('../src/utils/horseScope');
const audit = require('../src/modules/audit/audit.service');
const notifications = require('../src/modules/alerts/notification.service');

const MIN = 60000;
const ids = { session: '64b000000000000000000001', horse: '64b000000000000000000002', plan: '64b000000000000000000003', user: '64b000000000000000000004' };
let rows;
let booked;
let notices;
let beforeWrite;
let saveError;
let planStatus;
let medicalBlock;
let computeHook;

scope.canAccessHorse = async () => true;
readiness.getMedicalBlock = async () => medicalBlock;
readiness.computeReadiness = async () => {
  if (computeHook) await computeHook();
  return { horse: { _id: ids.horse, name: 'Thunder' }, overall: 'ready', gates: [{ key: 'medical', status: 'ok' }] };
};
audit.logAction = async () => {};
notifications.pushNotification = async () => {};
notifications.notifyCaretaker = async () => {};
notifications.notifyHorseStaff = async (entry) => notices.push(entry);

TrainingPlan.findById = () => ({
  _id: ids.plan, horse: ids.horse, status: planStatus,
  select: async () => ({ status: planStatus }),
});
Horse.findById = () => ({ select: async () => ({ name: 'Thunder' }) });

const equal = (a, b) => a == null || b == null ? a == null && b == null : String(a instanceof Date ? a.getTime() : a) === String(b instanceof Date ? b.getTime() : b);
const valueAt = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((condition) => matches(row, condition));
    const actual = valueAt(row, key);
    if (value && !(value instanceof Date) && typeof value === 'object' && !value.toHexString) {
      if ('$in' in value) return value.$in.some((v) => equal(actual, v));
      if ('$lt' in value) return actual != null && actual < value.$lt;
    }
    return equal(actual, value);
  });
}
function update(row, change) {
  Object.assign(row, change.$set);
  for (const key of Object.keys(change.$unset || {})) delete row[key];
}
TrainingSession.findById = async (id) => {
  const row = rows.find((entry) => equal(entry._id, id));
  return row ? new TrainingSession(row) : null;
};
TrainingSession.exists = async () => false;
TrainingSession.find = (filter) => ({
  populate: async () => rows.filter((row) => matches(row, filter)).map((row) => ({ ...structuredClone(row), horse: { _id: ids.horse, name: 'Thunder' } })),
});
TrainingSession.updateOne = async (filter, change) => {
  if (beforeWrite) { const hook = beforeWrite; beforeWrite = null; await hook(); }
  const row = rows.find((entry) => matches(entry, filter));
  if (!row) return { modifiedCount: 0 };
  update(row, change);
  return { modifiedCount: 1 };
};
TrainingSession.findOneAndUpdate = async (filter, change) => {
  if (beforeWrite) { const hook = beforeWrite; beforeWrite = null; await hook(); }
  const row = rows.find((entry) => matches(entry, filter));
  if (!row) return null;
  update(row, change);
  return new TrainingSession(row);
};
TrainingSession.prototype.save = async function save() {
  if (saveError) throw saveError;
  booked.push(this.toObject());
  return this;
};
TrainingSession.create = async (body) => new TrainingSession(body).save();

// Load after patching: these modules destructure their service collaborators.
const controller = require('../src/modules/training/trainingSession.controller');
const { markMissedSessions } = require('../src/modules/training/trainingSession.service');

function session(overrides = {}) {
  return {
    _id: ids.session, horse: ids.horse, trainingPlan: ids.plan,
    status: 'scheduled', kind: 'canter', objective: 'endurance', intensity: 'moderate',
    sessionType: 'training', prescription: { distanceM: 2400 },
    scheduledAt: new Date(Date.now() + 20 * MIN), rescheduledTo: null,
    ...overrides,
  };
}
async function call(handler, body) {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
  await handler({ params: { id: ids.session }, body, user: { _id: ids.user, name: 'Trainer' } }, res, (err) => { throw err; });
  return res;
}
test.beforeEach(() => {
  rows = [session()]; booked = []; notices = [];
  beforeWrite = null; saveError = null; computeHook = null;
  planStatus = 'active'; medicalBlock = null;
});

test('missed sessions are rebooked once even when two requests arrive together', async () => {
  rows[0].status = 'missed';
  const body = { scheduledAt: new Date(Date.now() + 60 * MIN).toISOString() };
  const responses = await Promise.all([call(controller.rescheduleSession, body), call(controller.rescheduleSession, body)]);
  assert.deepEqual(responses.map((res) => res.code).sort(), [201, 409]);
  assert.equal(booked.length, 1);
  assert.equal(rows[0].status, 'missed', 'the original remains history');
  assert.equal(String(rows[0].rescheduledTo), String(booked[0]._id));
  assert.equal(booked[0].status, 'scheduled');
  assert.equal(booked[0].prescription.distanceM, 2400);
  assert.equal(booked[0].actualStartAt, null);
  assert.equal(booked[0].readiness.checkedAt, undefined);
});

test('failed rebooking releases its reservation so the trainer can retry', async () => {
  rows[0].status = 'missed';
  saveError = new Error('simulated persistence failure');
  const body = { scheduledAt: new Date(Date.now() + 60 * MIN).toISOString() };
  await assert.rejects(call(controller.rescheduleSession, body), /simulated persistence failure/);
  assert.equal(rows[0].rescheduledTo, null);
  saveError = null;
  assert.equal((await call(controller.rescheduleSession, body)).code, 201);
  assert.equal(booked.length, 1);
});

test('rebooking rejects finished plans, a medical block, and times outside the future', async () => {
  rows[0].status = 'missed';
  const body = { scheduledAt: new Date(Date.now() + 60 * MIN).toISOString() };
  for (const status of ['completed', 'cancelled']) {
    planStatus = status;
    assert.equal((await call(controller.rescheduleSession, body)).code, 409);
  }
  planStatus = 'active'; medicalBlock = 'Khóa huấn luyện';
  assert.equal((await call(controller.rescheduleSession, body)).code, 409);
  medicalBlock = null;
  for (const scheduledAt of ['invalid', new Date(Date.now() - MIN).toISOString()]) {
    assert.equal((await call(controller.rescheduleSession, { scheduledAt })).code, 400);
  }
  assert.equal(booked.length, 0);
  assert.equal(rows[0].rescheduledTo, null);
});

test('changing the time resets ready/blocked sessions and requires a fresh pre-check', async () => {
  for (const status of ['scheduled', 'ready', 'blocked']) {
    rows = [session({ status, readiness: { checkedAt: new Date(), confirmedBy: ids.user, bodyTempC: 37.7, overrideReason: 'old observation' }, blockedReason: 'old block' })];
    const scheduledAt = new Date(Date.now() + 60 * MIN);
    const res = await call(controller.updateSession, { scheduledAt: scheduledAt.toISOString() });
    assert.equal(res.code, 200, status);
    assert.equal(rows[0].status, 'scheduled');
    assert.equal(rows[0].scheduledAt.getTime(), scheduledAt.getTime());
    assert.equal(rows[0].readiness, undefined);
    assert.equal(rows[0].blockedReason, undefined);
  }
});

test('a session started during the time change cannot be moved back to scheduled', async () => {
  rows[0].status = 'ready';
  const oldTime = rows[0].scheduledAt.getTime();
  beforeWrite = () => { rows[0].status = 'in_progress'; };
  const res = await call(controller.updateSession, { scheduledAt: new Date(Date.now() + 60 * MIN).toISOString() });
  assert.equal(res.code, 409);
  assert.equal(rows[0].status, 'in_progress');
  assert.equal(rows[0].scheduledAt.getTime(), oldTime);
});

test('an in-flight pre-check cannot restore readiness after the booking was moved', async () => {
  const scheduledAt = new Date(Date.now() + 40 * MIN);
  computeHook = () => { rows[0].scheduledAt = scheduledAt; delete rows[0].readiness; };
  const res = await call(controller.preCheckSession, { confirmed: true });
  assert.equal(res.code, 409);
  assert.equal(rows[0].status, 'scheduled');
  assert.equal(rows[0].scheduledAt.getTime(), scheduledAt.getTime());
  assert.equal(rows[0].readiness, undefined);
});

test('an in-flight start cannot use the readiness of a booking moved or pre-checked again', async () => {
  for (const changed of ['scheduledAt', 'checkedAt']) {
    rows = [session({ status: 'ready', readiness: { checkedAt: new Date(Date.now() - MIN), confirmedBy: ids.user } })];
    computeHook = () => {
      if (changed === 'scheduledAt') rows[0].scheduledAt = new Date(Date.now() + 40 * MIN);
      else rows[0].readiness.checkedAt = new Date();
    };
    const res = await call(controller.startSession, {});
    assert.equal(res.code, 409, changed);
    assert.equal(rows[0].status, 'ready', changed);
    assert.equal(rows[0].actualStartAt, undefined, changed);
    assert.equal(rows[0].startedBy, undefined, changed);
  }
});

test('booking or moving a session rejects invalid and past times', async () => {
  for (const scheduledAt of ['invalid', new Date(Date.now() - MIN).toISOString()]) {
    assert.equal((await call(controller.createSession, { horse: ids.horse, trainingPlan: ids.plan, scheduledAt })).code, 400);
    assert.equal((await call(controller.updateSession, { scheduledAt })).code, 400);
  }
  assert.equal(booked.length, 0);
});

test('the missed job respects the 30-minute window and the ready pre-check lifetime', async () => {
  const now = new Date('2026-10-08T08:00:00Z');
  const at = (minutes) => new Date(now.getTime() - minutes * MIN);
  rows = [
    session({ _id: 's1', scheduledAt: at(30) }),
    session({ _id: 's2', scheduledAt: at(31) }),
    session({ _id: 's3', status: 'blocked', scheduledAt: at(31) }),
    session({ _id: 's4', status: 'ready', scheduledAt: at(90), readiness: { checkedAt: at(119) } }),
    session({ _id: 's5', status: 'ready', scheduledAt: at(90), readiness: { checkedAt: at(120) } }),
    session({ _id: 's6', status: 'ready', scheduledAt: at(90), readiness: { checkedAt: at(121) } }),
    session({ _id: 's7', status: 'in_progress', scheduledAt: at(90) }),
  ];
  assert.equal(await markMissedSessions(now), 3);
  assert.deepEqual(rows.map((row) => row.status), ['scheduled', 'missed', 'missed', 'ready', 'ready', 'missed', 'in_progress']);
  assert.equal(notices.length, 3);
});

test('the missed job does not mark a booking moved to the future after its read', async () => {
  const now = new Date('2026-10-08T08:00:00Z');
  rows[0].scheduledAt = new Date(now.getTime() - 31 * MIN);
  beforeWrite = () => { rows[0].scheduledAt = new Date(now.getTime() + 60 * MIN); };
  assert.equal(await markMissedSessions(now), 0);
  assert.equal(rows[0].status, 'scheduled');
  assert.equal(notices.length, 0);
});

test('the missed job does not mark a ready session whose pre-check was refreshed after its read', async () => {
  const now = new Date('2026-10-08T08:00:00Z');
  rows[0] = session({ status: 'ready', scheduledAt: new Date(now.getTime() - 90 * MIN), readiness: { checkedAt: new Date(now.getTime() - 121 * MIN) } });
  beforeWrite = () => { rows[0].readiness.checkedAt = now; };
  assert.equal(await markMissedSessions(now), 0);
  assert.equal(rows[0].status, 'ready');
  assert.equal(notices.length, 0);
});
