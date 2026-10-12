const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const TEST_PASSWORD = 'Local-Test-Only-123456';

async function startIntegration(label = 'flow') {
  const uri = process.env.TEST_MONGO_URI;
  assert.ok(uri, 'Set TEST_MONGO_URI to a local MongoDB test server.');
  assert.match(uri, /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//, 'Integration tests only connect to local MongoDB.');
  assert.match(label, /^[a-z0-9_]+$/);
  const dbName = `wdp301_test_${label}_${process.pid}_${Date.now()}`;
  // Set before loading app/config: never read the real deployment connection string.
  process.env.MONGO_URI = uri;
  process.env.JWT_SECRET = 'integration-test-secret-not-for-deployment';
  process.env.APP_TIMEZONE = 'Asia/Ho_Chi_Minh';
  process.env.AFTERNOON_LIGHT_ONLY = 'false';
  process.env.ENABLE_SENSOR_SIMULATOR = 'false';
  process.env.CLIENT_URL = 'http://127.0.0.1:5180';
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  let server, io;
  try {
  const app = require('../src/app');
  server = http.createServer(app);
  io = require('../src/realtime/socketServer').initSocket(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const models = mongoose.models;
  await Promise.all(Object.values(models).map((model) => model.init()));
  const users = {};
  const tokens = {};
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
  const { ROLES } = require('../src/constants/roles');
  for (const [key, role] of Object.entries({ manager: ROLES.MANAGER, trainer: ROLES.HEAD_TRAINER, vet: ROLES.VETERINARIAN, groom: ROLES.GROOM, owner: ROLES.OWNER, outsider: ROLES.OWNER })) {
    users[key] = await models.User.create({ name: `TEST ${key}`, email: `${key}@integration.test`, passwordHash, role });
  }
  async function raw(role, method, route, body) {
    const response = await fetch(`${baseUrl}/api/v1${route}`, {
      method,
      headers: { ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const type = response.headers.get('content-type') || '';
    return { status: response.status, body: type.includes('json') ? await response.json() : await response.text() };
  }
  async function api(role, method, route, body, expected = 200) {
    const result = await raw(role, method, route, body);
    assert.equal(result.status, expected, `${role} ${method} ${route}: ${JSON.stringify(result.body)}`);
    return result.body.data;
  }
  for (const key of Object.keys(users)) {
    const login = await api(null, 'POST', '/auth/login', { email: users[key].email, password: TEST_PASSWORD });
    tokens[key] = login.token;
  }
  async function close({ retain = false } = {}) {
    await new Promise((resolve) => io.close(resolve));
    if (!retain) {
      assert.equal(mongoose.connection.name, dbName);
      assert.match(dbName, /^wdp301_test_/);
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  }
  return { api, raw, users, tokens, models, baseUrl, dbName, close, server, io };
  } catch (error) {
    if (io) await new Promise((resolve) => io.close(resolve));
    if (mongoose.connection.name === dbName && /^wdp301_test_/.test(dbName)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    throw error;
  }
}

function clock(at = new Date()) {
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}
/** The meal a time of day belongs to (rations: breakfast before 11:00, lunch to 15:59, then the evening meal). */
function mealSlotAt(at = new Date()) {
  const h = at.getHours();
  return h < 11 ? 'morning' : h < 16 ? 'noon' : 'evening';
}
function future(minutes = 10) { return new Date(Date.now() + minutes * 60000).toISOString(); }
function day(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function intake(ctx, name = 'TEST Sao Mai') {
  const { api, users } = ctx;
  const horse = await api('manager', 'POST', '/horses', { name, breed: 'Thoroughbred', owner: users.owner.id, assignedTrainer: users.trainer.id, assignedVet: users.vet.id }, 201);
  await api('manager', 'POST', '/stable/assignments', { horse: horse._id, stableBlock: name, assignedCaretaker: users.groom.id }, 201);
  const record = await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'Test assessment', resultStatus: 'eligible', clearedLevel: 'high', vitalSigns: { temperatureC: 37.8, heartRate: 38 } }, 201);
  return { horse, record };
}

async function planFor(ctx, horse, extra = {}) {
  return ctx.api('trainer', 'POST', '/training/plans', {
    horse: horse._id, phase: 'base_building', distanceTarget: 1600, weeklyVolumeKm: 20,
    intensity: 'moderate', surface: 'dirt', startDate: day().toISOString(), status: 'active', goal: 'Integration training cycle',
    ...extra,
  }, 201);
}
async function book(ctx, horse, plan, extra = {}) {
  return ctx.api('trainer', 'POST', '/training/sessions', {
    horse: horse._id, trainingPlan: plan._id, kind: 'walk', scheduledAt: future(),
    overrideReason: 'Test fixture without previous meal history; supervised training.', ...extra,
  }, 201);
}
async function start(ctx, session) {
  await ctx.api('trainer', 'POST', `/training/sessions/${session._id}/pre-check`, { confirmed: true, bodyTempC: 37.8, overrideReason: 'Test fixture supervised by trainer.' });
  return ctx.api('trainer', 'POST', `/training/sessions/${session._id}/start`, { overrideReason: 'Test fixture supervised by trainer.' });
}

module.exports = { startIntegration, intake, planFor, book, start, clock, day, future, mealSlotAt, TEST_PASSWORD };
