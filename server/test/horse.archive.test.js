// Preserve the archived horse's history while taking it off staff working lists.
const test = require('node:test');
const assert = require('node:assert/strict');
const Horse = require('../src/models/Horse');
const TrainingPlan = require('../src/models/TrainingPlan');
const TrainingSession = require('../src/models/TrainingSession');
const RaceEntry = require('../src/models/RaceEntry');
const StableAssignment = require('../src/models/StableAssignment');
const DailyTask = require('../src/models/DailyTask');
const ExamRequest = require('../src/models/ExamRequest');
const Treatment = require('../src/models/Treatment');
const audit = require('../src/modules/audit/audit.service');
const notifications = require('../src/modules/alerts/notification.service');
const clearance = require('../src/modules/health/trainingClearance');
const { ROLES } = require('../src/constants/roles');
const scope = require('../src/utils/horseScope');

audit.logAction = async () => {};
notifications.pushNotification = async () => {};
clearance.clearanceMap = async () => new Map();
const controller = require('../src/modules/horses/horses.controller');
const { closeLeftoversFor, closeArchivedLeftovers } = require('../src/modules/horses/archive.service');

let horses;
let tasks;
let exams;
let treatments;
let sessions;
let plans;
let races;

const valueAt = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
function matches(row, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const value = valueAt(row, key);
    if (!expected || typeof expected !== 'object' || expected instanceof Date) return String(value) === String(expected);
    if ('$exists' in expected) return (value !== undefined) === expected.$exists;
    if ('$in' in expected) return expected.$in.map(String).includes(String(value));
    if ('$ne' in expected) return String(value) !== String(expected.$ne);
    if ('$gte' in expected) return value >= expected.$gte;
    throw new Error(`Unhandled test filter ${key}`);
  });
}

function updateRows(rows, filter, update) {
  let modifiedCount = 0;
  for (const row of rows.filter((candidate) => matches(candidate, filter))) {
    for (const [key, value] of Object.entries(update)) {
      const parts = key.split('.');
      const field = parts.pop();
      const parent = parts.reduce((object, part) => object[part], row);
      parent[field] = value;
    }
    modifiedCount += 1;
  }
  return { modifiedCount };
}

async function call(handler, { body = {}, query = {}, role = ROLES.MANAGER } = {}) {
  const res = { code: 200, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
  await handler({ params: { id: 'h1' }, user: { _id: 'u1', role }, body, query }, res, (error) => { throw error; });
  return res;
}

test.beforeEach(() => {
  const horse = {
    _id: 'h1', name: 'Thunder', isArchived: false, owner: 'u1', assignedTrainer: 'u1', assignedVet: 'u1',
    async save() {}, toObject() { return { ...this }; },
  };
  horses = [horse];
  tasks = [
    { horse: 'h1', status: 'pending', incidentReport: { description: 'Horse limping', status: 'open' } },
    { horse: 'h1', status: 'pending', observation: { behaviourNote: 'Quiet' } },
    { horse: 'h1', status: 'completed', observation: { appetite: 'full' } },
  ];
  exams = [{ horse: 'h1', status: 'pending' }, { horse: 'h1', status: 'completed' }];
  treatments = [{ horse: 'h1', status: 'ongoing' }, { horse: 'h1', status: 'completed' }];
  sessions = [{ horse: 'h1', status: 'ready' }, { horse: 'h1', status: 'completed' }];
  plans = [{ horse: 'h1', status: 'active' }, { horse: 'h1', status: 'completed' }];
  races = [{ horse: 'h1', status: 'confirmed', raceDate: new Date(Date.now() + 86400000) }];
  Horse.findById = async () => horse;
  Horse.exists = async (filter) => horses.some((candidate) => matches(candidate, filter));
  Horse.find = (filter) => {
    const query = {
      select: async () => horses.filter((candidate) => matches(candidate, filter)),
      populate: () => query,
      sort: async () => horses.filter((candidate) => matches(candidate, filter)),
    };
    return query;
  };
  for (const [model, rows] of [[DailyTask, tasks], [ExamRequest, exams], [Treatment, treatments], [TrainingSession, sessions], [TrainingPlan, plans], [RaceEntry, races]]) {
    model.updateMany = async (filter, update) => updateRows(rows, filter, update);
  }
  DailyTask.deleteMany = async () => { throw new Error('Archive must preserve task history'); };
  StableAssignment.deleteMany = async () => ({ deletedCount: 1 });
});

test('archive closes work, exams and treatments while preserving observations and incident reports', async () => {
  const res = await call(controller.archiveHorse, { body: { reason: 'Retired' } });
  assert.equal(res.code, 200);
  assert.equal(horses[0].isArchived, true);
  assert.deepEqual(tasks.map((task) => task.status), ['skipped', 'skipped', 'completed']);
  assert.equal(tasks[0].incidentReport.description, 'Horse limping');
  assert.equal(tasks[0].incidentReport.status, 'resolved');
  assert.match(tasks[0].incidentReport.response, /Retired/);
  assert.equal(tasks[1].observation.behaviourNote, 'Quiet');
  assert.equal(tasks[2].observation.appetite, 'full');
  assert.equal(exams[0].status, 'cancelled');
  assert.equal(treatments[0].status, 'completed');
  assert.deepEqual(sessions.map((session) => session.status), ['cancelled', 'completed']);
  assert.deepEqual(plans.map((plan) => plan.status), ['cancelled', 'completed']);
  assert.equal(races[0].status, 'withdrawn');
  assert.deepEqual(await closeLeftoversFor(horses[0]), { exams: 0, treatments: 0, incidents: 0 });
});

test('hourly cleanup closes old archived pending work without deleting its report', async () => {
  horses[0].isArchived = true;
  horses[0].archivedReason = 'Sold';
  const closed = await closeArchivedLeftovers();
  assert.deepEqual(closed, { exams: 1, treatments: 1, incidents: 1 });
  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].status, 'skipped');
  assert.equal(tasks[0].incidentReport.status, 'resolved');
  assert.match(tasks[0].skipReason, /Sold/);
});

test('archived horses disappear from trainer and vet scope; owner and manager retain history access', async () => {
  horses.push({ ...horses[0], _id: 'h2', isArchived: true });
  for (const role of [ROLES.HEAD_TRAINER, ROLES.VETERINARIAN]) {
    const user = { _id: 'u1', role };
    assert.deepEqual(await scope.getScopedHorseIds(user), ['h1']);
    assert.equal(await scope.canAccessHorse(user, 'h2'), false);
  }
  assert.deepEqual(await scope.getScopedHorseIds({ _id: 'u1', role: ROLES.OWNER }), ['h1', 'h2']);
  assert.equal(await scope.canAccessHorse({ _id: 'u1', role: ROLES.OWNER }, 'h2'), true);
  assert.equal(await scope.getScopedHorseIds({ _id: 'u1', role: ROLES.MANAGER }), null);
  assert.equal(await scope.canAccessHorse({ _id: 'u1', role: ROLES.MANAGER }, 'h2'), true);
});

test('only manager can explicitly request the archived horse roster', async () => {
  horses.push({ ...horses[0], _id: 'h2', isArchived: true });
  for (const role of [ROLES.HEAD_TRAINER, ROLES.VETERINARIAN, ROLES.GROOM, ROLES.OWNER]) {
    const res = await call(controller.listHorses, { role, query: { archived: 'true' } });
    assert.deepEqual(res.payload.data.map((horse) => horse._id), ['h1']);
  }
  const archived = await call(controller.listHorses, { query: { archived: 'true' } });
  assert.deepEqual(archived.payload.data.map((horse) => horse._id), ['h2']);
});
