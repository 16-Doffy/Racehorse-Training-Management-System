const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { startIntegration, intake, planFor, book, clock, mealSlotAt, TEST_PASSWORD } = require('../../test-support/integration');

test('the automatic day does what is due on the horses already there, and nothing past a block', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('autooperate');
  t.after(() => ctx.close());
  const { api, models, users, baseUrl } = ctx;
  const accounts = { password: TEST_PASSWORD, ...Object.fromEntries(['manager', 'trainer', 'vet', 'groom', 'owner'].map((r) => [r, users[r].email])) };
  const operate = (env = {}) => new Promise((resolve, reject) => {
    const run = spawn(process.execPath, [path.join(__dirname, '../../scripts/autoOperate.js')], {
      env: { ...process.env, LIVE_API_URL: `${baseUrl}/api/v1`, DEMO_ACCOUNTS: JSON.stringify(accounts), OPERATE_RUN_MIN: '0', OPERATE_CONFIRM: '', OPERATE_UNTIL: '', GITHUB_STEP_SUMMARY: '', ...env },
    });
    let output = '';
    run.stdout.on('data', (d) => { output += d; });
    run.stderr.on('data', (d) => { output += d; });
    run.on('error', reject);
    run.on('close', (code) => resolve({ code, output }));
  });

  const hay = await api('manager', 'POST', '/inventory', { name: 'TEST auto hay', category: 'feed', unit: 'kg', quantity: 500, feedType: 'forage' }, 201);
  const { horse } = await intake(ctx, 'TEST Auto Horse');
  const plan = await planFor(ctx, horse);
  const now = new Date();
  await api('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: mealSlotAt(now), timeOfDay: clock(now), items: [{ inventoryItem: hay._id, amount: 2 }] }, 201);
  const meal = async () => models.DailyTask.findOne({ horse: horse._id, taskType: 'feeding', mealSlot: mealSlotAt(now) }).lean();
  const session = await book(ctx, horse, plan, { scheduledAt: new Date(Date.now() + 30000).toISOString() });
  const sessionNow = () => models.TrainingSession.findById(session._id).lean();
  const horsesBefore = await models.Horse.countDocuments();
  const sessionsBefore = await models.TrainingSession.countDocuments();

  // Without the word to write: says what it would do, changes nothing.
  const dry = await operate();
  assert.equal(dry.code, 0, dry.output);
  assert.match(dry.output, /chạy thử, không ghi gì/);
  assert.match(dry.output, /Sẽ ghi nhận: TEST Auto Horse, cho ăn/);
  assert.match(dry.output, /Sẽ kiểm tra sẵn sàng và bắt đầu: TEST Auto Horse/);
  assert.equal((await meal()).status, 'pending');
  assert.equal((await sessionNow()).status, 'scheduled');

  // Past its last day: does nothing, even told to write.
  const late = await operate({ OPERATE_CONFIRM: 'write', OPERATE_UNTIL: '2001-01-01' });
  assert.equal(late.code, 0, late.output);
  assert.match(late.output, /Đã quá ngày dừng/);
  assert.equal((await meal()).status, 'pending');

  // A horse told to be left alone is left alone.
  const left = await operate({ OPERATE_CONFIRM: 'write', OPERATE_SKIP: 'test auto horse' });
  assert.equal(left.code, 0, left.output);
  assert.equal((await meal()).status, 'pending');
  assert.equal((await sessionNow()).status, 'scheduled');

  // Told to write: the groom records the meal, the trainer checks and starts the session, saying who it was.
  const run = await operate({ OPERATE_CONFIRM: 'write' });
  assert.equal(run.code, 0, run.output);
  const fed = await meal();
  assert.equal(fed.status, 'completed', run.output);
  assert.equal(String(fed.completedBy), String(users.groom.id));
  assert.match(JSON.stringify(fed.observation || {}), /Tự vận hành/);
  assert.equal((await sessionNow()).status, 'in_progress', run.output);
  assert.equal(await models.Horse.countDocuments(), horsesBefore, 'no horse created');
  assert.equal(await models.TrainingSession.countDocuments(), sessionsBefore, 'no session booked');

  // Finished: evaluated by the next pass, saying it was automatic.
  await api('trainer', 'POST', `/training/sessions/${session._id}/end`, { metrics: { avgHeartRate: 112, maxHeartRate: 124, maxSpeed: 13.4, distance: 4000 } });
  const next = await operate({ OPERATE_CONFIRM: 'write' });
  assert.equal(next.code, 0, next.output);
  const rated = await sessionNow();
  assert.equal(rated.status, 'evaluated', next.output);
  assert.ok(rated.performanceRating >= 6);
  assert.match(rated.trainerComment, /Tự vận hành/);

  // A horse the vet found injured is not run: the session stays refused, and the report says why.
  const { horse: hurt } = await intake(ctx, 'TEST Auto Hurt');
  const hurtPlan = await planFor(ctx, hurt);
  const hurtSession = await book(ctx, hurt, hurtPlan, { scheduledAt: new Date(Date.now() + 30000).toISOString() });
  await api('vet', 'POST', '/health/records', { horse: hurt._id, diagnosis: 'TEST injured', resultStatus: 'injured', vitalSigns: { temperatureC: 37.9, heartRate: 38 } }, 201);
  const refused = await operate({ OPERATE_CONFIRM: 'write' });
  assert.equal(refused.code, 0, refused.output);
  assert.notEqual((await models.TrainingSession.findById(hurtSession._id).lean()).status, 'in_progress', refused.output);
  assert.match(refused.output, /Không chạy: TEST Auto Hurt/);
});
