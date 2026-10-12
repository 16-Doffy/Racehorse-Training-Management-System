// Isolated API and scheduling regressions: no MongoDB connection or real notifications.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
require('../src/config/env');

const TrainingPlan = require('../src/models/TrainingPlan');
const TrainingSession = require('../src/models/TrainingSession');
const RaceEntry = require('../src/models/RaceEntry');
const readiness = require('../src/modules/training/readiness.service');
const clearance = require('../src/modules/health/trainingClearance');
const scope = require('../src/utils/horseScope');
const audit = require('../src/modules/audit/audit.service');
const notifications = require('../src/modules/alerts/notification.service');

let medicalBlock = null;
let trainingLevel = 'high';
readiness.getMedicalBlock = async () => medicalBlock;
clearance.getTrainingClearance = async () => ({ level: trainingLevel, label: trainingLevel });
scope.canAccessHorse = async () => true;
audit.logAction = async () => {};
notifications.notifyCaretaker = async () => {};

const { generatePlanWeek, mondayOf, DAY_MS } = require('../src/modules/training/trainingPlan.service');
const controller = require('../src/modules/training/trainingPlan.controller');
const { suggestPhases, planWarnings } = require('../src/constants/training');

let existing = [];
let created = [];
let bookingFilter = null;
let savedPlan = null;
let cancelled = [];
let race = null;

function planFor(start = mondayOf(Date.now() + 14 * DAY_MS), week = [
  { day: 1, kind: 'breeze', slot: 'morning' },
  { day: 1, kind: 'walk', slot: 'afternoon' },
]) {
  return {
    _id: 'p1', horse: { _id: 'h1', name: 'Thunder' }, targetRace: null,
    sessionTime: '07:30', afternoonTime: '16:00', status: 'active',
    startDate: start, phase: 'speed', distanceTarget: 1600, surface: 'turf', weeklyVolumeKm: 15,
    phases: [{ key: 'speed', weeks: 2, startDate: start, endDate: new Date(start.getTime() + 14 * DAY_MS - 1), week }],
  };
}

function record(overrides = {}) {
  const data = { ...planFor(), horse: 'h1', phases: undefined, ...overrides };
  data.toObject = () => ({ ...data });
  data.save = async () => { savedPlan = data; };
  return data;
}

function body(overrides = {}) {
  return {
    horse: 'h1', startDate: mondayOf(Date.now() + 14 * DAY_MS).toISOString(), phase: 'base_building',
    distanceTarget: 1600, weeklyVolumeKm: 14, surface: 'turf', sessionTime: '07:30', afternoonTime: '16:00',
    ...overrides,
  };
}

async function call(handler, { body: requestBody = {}, query = {}, params = { id: 'p1' } } = {}) {
  const res = { code: 200, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
  await handler({ body: requestBody, query, params, user: { _id: 'u1', role: 'head_trainer' } }, res, (error) => { throw error; });
  return res;
}

test.beforeEach(() => {
  medicalBlock = null;
  trainingLevel = 'high';
  existing = [];
  created = [];
  bookingFilter = null;
  savedPlan = null;
  cancelled = [];
  race = null;
  TrainingSession.find = (filter) => {
    bookingFilter = filter;
    return { select: async () => existing };
  };
  TrainingSession.create = async (session) => { created.push(session); return { _id: `s${created.length}`, ...session }; };
  TrainingSession.updateMany = async (filter, update) => { cancelled.push({ filter, update }); return { modifiedCount: 1 }; };
  TrainingPlan.create = async (plan) => { savedPlan = plan; return { _id: 'p1', ...plan }; };
  TrainingPlan.findOne = () => ({ select: async () => null });
  TrainingPlan.findById = async () => record();
  RaceEntry.findById = () => ({ select: async () => race });
});

test('books a morning workout and a light afternoon at the club clock', async () => {
  const plan = planFor();
  const result = await generatePlanWeek({ plan, weekStart: plan.startDate, actor: { _id: 'u1' }, notify: false });
  assert.equal(result.created.length, 2);
  assert.deepEqual(created.map((s) => [s.kind, s.scheduledAt.getHours(), s.scheduledAt.getMinutes()]), [['breeze', 7, 30], ['walk', 16, 0]]);
  assert.equal(created[0].scheduledAt.getUTCHours(), 0);
});

test('a manual or other-plan booking occupies the horse slot; regeneration is idempotent', async () => {
  const plan = planFor();
  const at = new Date(plan.startDate);
  at.setHours(9);
  existing.push({ scheduledAt: at, trainingPlan: 'other' });
  const first = await generatePlanWeek({ plan, weekStart: plan.startDate, actor: { _id: 'u1' }, notify: false });
  assert.equal(bookingFilter.horse, 'h1');
  assert.equal(bookingFilter.trainingPlan, undefined);
  assert.deepEqual(first.created.map((s) => s.kind), ['walk']);
  existing.push(...first.created);
  const again = await generatePlanWeek({ plan, weekStart: plan.startDate, actor: { _id: 'u1' }, notify: false });
  assert.equal(again.created.length, 0);
  assert.equal(again.skipped.length, 2);
});

test('today after the morning time skips morning but can still book the afternoon', async (t) => {
  const start = new Date('2030-01-06T17:00:00.000Z'); // Monday in Vietnam
  t.mock.timers.enable({ apis: ['Date'], now: start.getTime() + 10 * 60 * 60 * 1000 });
  const plan = planFor(start);
  const result = await generatePlanWeek({ plan, weekStart: start, actor: { _id: 'u1' }, notify: false });
  assert.deepEqual(result.created.map((s) => s.kind), ['walk']);
  assert.match(result.skipped[0].reason, /đã qua giờ tập/);
});

test('the vet restriction reduces work and a medical block books nothing', async () => {
  const plan = planFor();
  trainingLevel = 'light';
  const reduced = await generatePlanWeek({ plan, weekStart: plan.startDate, actor: { _id: 'u1' }, notify: false });
  assert.ok(reduced.created.every((s) => s.kind === 'walk' && s.intensity === 'light'));
  medicalBlock = 'training lock';
  created.length = 0;
  const blocked = await generatePlanWeek({ plan, weekStart: plan.startDate, actor: { _id: 'u1' }, notify: false });
  assert.match(blocked.error, /training lock/);
  assert.equal(created.length, 0);
});

test('race day is skipped and the trial replaces both normal workouts eight days earlier', async () => {
  const start = mondayOf(Date.now() + 14 * DAY_MS);
  const plan = planFor(start);
  plan.targetRace = { _id: 'r1', raceName: 'Cup', raceDate: new Date(start.getTime() + 8 * DAY_MS), distance: 2000, status: 'confirmed' };
  const trial = await generatePlanWeek({ plan, weekStart: start, actor: { _id: 'u1' }, notify: false });
  assert.equal(trial.created.length, 1);
  assert.equal(trial.created[0].kind, 'trial');
  assert.equal(trial.created[0].prescription.distanceM, 2000);
  assert.equal(String(trial.created[0].raceEntry), 'r1', 'the trial is linked to the plan race');
  const raceWeek = await generatePlanWeek({ plan, weekStart: new Date(start.getTime() + 7 * DAY_MS), actor: { _id: 'u1' }, notify: false });
  assert.ok(raceWeek.skipped.some((s) => /ngày đua Cup/.test(s.reason)));
});

test('invalid generator dates and swapped slot clocks are rejected before booking', async () => {
  for (const changes of [{ sessionTime: '16:00' }, { afternoonTime: '07:30' }, { sessionTime: '7:30' }]) {
    const plan = { ...planFor(), ...changes };
    const result = await generatePlanWeek({ plan, actor: { _id: 'u1' }, notify: false });
    assert.ok(result.error);
  }
  assert.ok((await generatePlanWeek({ plan: planFor(), weekStart: 'invalid', actor: { _id: 'u1' }, notify: false })).error);
  assert.equal(created.length, 0);
});

test('suggestions include the race week and vary base work with race distance', () => {
  const start = new Date('2030-01-07');
  for (const days of [1, 6, 7, 13, 14, 83]) {
    const raceDate = new Date(start.getTime() + days * DAY_MS);
    const phases = suggestPhases(start, raceDate, 1600);
    assert.equal(phases.filter((p) => p.key !== 'recovery').reduce((n, p) => n + p.weeks, 0), Math.ceil((days + 1) / 7));
    assert.equal(phases.at(-1).key, 'recovery');
    assert.deepEqual(planWarnings(phases, { startDate: start, raceDate, distance: 1600 }).filter((w) => w.level === 'error'), []);
  }
  const raceDate = new Date(start.getTime() + 83 * DAY_MS);
  const sprint = suggestPhases(start, raceDate, 1000);
  const long = suggestPhases(start, raceDate, 2400);
  assert.ok(long.find((p) => p.key === 'base_building').weeks > sprint.find((p) => p.key === 'base_building').weeks);
});

test('create and suggestion reject past or invalid dates without saving', async () => {
  const yesterday = new Date(Date.now() - DAY_MS).toISOString();
  for (const startDate of [yesterday, 'invalid']) {
    assert.equal((await call(controller.createPlan, { body: body({ startDate }) })).code, 400);
    assert.equal((await call(controller.suggestPlan, { query: { horse: 'h1', startDate } })).code, 400);
  }
  assert.equal(savedPlan, null);
});

test('update rejects backdating and activating a stale draft, while old plans may still be closed', async () => {
  const yesterday = new Date(Date.now() - DAY_MS);
  assert.equal((await call(controller.updatePlan, { body: { startDate: yesterday.toISOString() } })).code, 400);
  const draft = record({ startDate: yesterday, status: 'draft' });
  TrainingPlan.findById = async () => draft;
  assert.equal((await call(controller.updatePlan, { body: { status: 'active' } })).code, 400);
  assert.equal(savedPlan, null);
  assert.equal((await call(controller.updatePlan, { body: { status: 'cancelled' } })).code, 200);
  assert.deepEqual(cancelled[0].filter.status.$in, ['scheduled', 'ready', 'blocked']);
  assert.equal(cancelled[0].filter.scheduledAt, undefined); // a READY workout in today's grace window also closes
});

test('API rejects heavy afternoons, duplicate slots and malformed phase templates', async () => {
  for (const week of [
    [{ day: 1, kind: 'breeze', slot: 'afternoon' }],
    [{ day: 1, kind: 'walk' }, { day: 1, kind: 'canter' }],
    [{ day: 1, kind: 'walk', slot: 'invalid' }],
    [null],
    'invalid',
  ]) {
    const res = await call(controller.createPlan, { body: body({ phases: [{ key: 'speed', weeks: 1, week }] }) });
    assert.equal(res.code, 400);
  }
  assert.equal((await call(controller.createPlan, { body: body({ phases: [null] }) })).code, 400);
  assert.equal(savedPlan, null);
});

test('API accepts AM plus light PM, but refuses inconsistent clocks and race dates', async () => {
  const valid = body({ phases: [{ key: 'speed', weeks: 1, week: [{ day: 1, kind: 'breeze' }, { day: 1, kind: 'walk', slot: 'afternoon' }] }] });
  assert.equal((await call(controller.createPlan, { body: valid })).code, 201);
  assert.equal(savedPlan.phases[0].week.length, 2);
  assert.equal((await call(controller.createPlan, { body: body({ afternoonTime: '08:00' }) })).code, 400);
  race = { horse: 'h1', raceDate: new Date(valid.startDate), distance: 1600 };
  assert.equal((await call(controller.createPlan, { body: body({ targetRace: 'r1' }) })).code, 400);
});

test('startup configuration overrides a UTC host before date-only plan calculations', () => {
  const script = "require('./src/config/env'); const {startOfDay}=require('./src/modules/training/trainingPlan.service'); process.stdout.write(JSON.stringify({tz:process.env.TZ,start:startOfDay('2030-01-07').toISOString()}));";
  const child = spawnSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, TZ: 'UTC', APP_TIMEZONE: 'Asia/Ho_Chi_Minh' },
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { tz: 'Asia/Ho_Chi_Minh', start: '2030-01-06T17:00:00.000Z' });
});
