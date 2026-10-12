const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, day } = require('../../test-support/integration');

// A missed meal is not just a red label: the trainer is told, harder work waits until the horse has
// eaten, and the trainer can ask the groom to feed it now. Rations sit in their part of the day, far
// enough apart, and the trainer can delete one.
test('meals: ration times, missed meals, hard work on an empty stomach, make-up, delete', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('meals');
  t.after(() => ctx.close());
  const { api, raw, users, models } = ctx;
  const { horse } = await intake(ctx, 'TEST Meals Horse');
  const oats = await api('manager', 'POST', '/inventory', { name: 'TEST oats meal', category: 'feed', unit: 'kg', quantity: 50 }, 201);
  const line = [{ inventoryItem: oats._id, amount: 2 }];
  let morning;

  await t.test('a ration sits in its part of the day and at least 3 hours from the others', async () => {
    const lunchAtNight = await raw('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'noon', timeOfDay: '23:00', items: line });
    assert.equal(lunchAtNight.status, 400);
    assert.match(lunchAtNight.body.message, /Bữa trưa phải từ 11:00 đến 15:59/);
    assert.equal((await raw('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'evening', timeOfDay: '07:00', items: line })).status, 400);
    morning = await api('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'morning', timeOfDay: '06:00', items: line }, 201);
    await api('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'evening', timeOfDay: '17:00', items: line }, 201);
    const tooClose = await raw('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'noon', timeOfDay: '15:30', items: line });
    assert.equal(tooClose.status, 400);
    assert.match(tooClose.body.message, /quá gần bữa chiều 17:00 .* ít nhất 3 giờ/);
    assert.equal((await raw('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'morning', timeOfDay: '07:00', items: line })).status, 409, 'one ration per meal');
    const moved = await raw('trainer', 'PUT', `/feeding/${morning._id}`, { timeOfDay: '14:00' });
    assert.equal(moved.status, 400, 'moving breakfast into the afternoon is refused too');
  });

  await t.test('B: a meal whose window closed unrecorded tells the trainer and the groom once', async () => {
    const { notifyMissedMeals } = require('../../src/modules/stable/missedCare.service');
    const yesterday = day(-1);
    yesterday.setHours(6, 0, 0, 0);
    const missed = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: 'morning', scheduledDate: yesterday });
    const generic = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: null, scheduledDate: yesterday });
    assert.ok((await notifyMissedMeals()) >= 1);
    const toTrainer = await models.Notification.find({ type: 'meal_missed', recipientUser: users.trainer.id, message: /TEST Meals Horse: bữa sáng \(06:00/ });
    assert.equal(toTrainer.length, 1);
    assert.equal(await models.Notification.countDocuments({ type: 'meal_missed', recipientUser: users.groom.id, message: /TEST Meals Horse/ }), 1);
    assert.equal(await notifyMissedMeals(), 0, 'told once');
    assert.equal((await models.DailyTask.findById(generic._id)).missedNotifiedAt, null, 'the no-ration task is reported by the groom instead');
    assert.ok((await models.DailyTask.findById(missed._id)).missedNotifiedAt);
  });

  await t.test('C + make-up: a horse that may not have eaten gets no hard work until it is fed', async () => {
    const { computeReadiness } = require('../../src/modules/training/readiness.service');
    // Earlier meals were not given: the last meal before the session was reported not done today.
    await models.DailyTask.deleteMany({ horse: horse._id, taskType: 'feeding' });
    const today = day();
    today.setMinutes(1);
    const skipped = await models.DailyTask.create({
      horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: 'morning',
      scheduledDate: today, status: 'skipped', skipReason: 'TEST hết cám',
    });
    const at = new Date(Date.now() + 15 * 60000);
    const hard = (await computeReadiness(horse._id, { scheduledAt: at, intensity: 'high' })).gates.find((g) => g.key === 'nutrition');
    assert.equal(hard.status, 'blocked', hard.detail);
    assert.match(hard.detail, /nhân viên báo không cho ăn được \(TEST hết cám\)/);
    assert.equal(hard.action, 'make_up_meal');
    assert.equal(String(hard.taskId), String(skipped._id));
    const light = (await computeReadiness(horse._id, { scheduledAt: at, intensity: 'light' })).gates.find((g) => g.key === 'nutrition');
    assert.equal(light.status, 'caution', 'light work only warns');

    const makeUp = await api('trainer', 'POST', `/stable/tasks/${skipped._id}/make-up`, undefined, 201);
    assert.equal(String(makeUp.makeUpOf), String(skipped._id));
    assert.equal(makeUp.mealSlot, 'morning');
    assert.equal(makeUp.supplies[0].amount, 2, 'from the ration as it stands');
    assert.ok(await models.Notification.exists({ recipientUser: users.groom.id, message: /yêu cầu cho ăn bù bữa sáng/ }));
    assert.equal((await raw('trainer', 'POST', `/stable/tasks/${skipped._id}/make-up`)).status, 409, 'once per missed meal');
    await api('groom', 'PATCH', `/stable/tasks/${makeUp._id}/complete`, { clientOpId: 'make-up-1' });
    const after = (await computeReadiness(horse._id, { scheduledAt: at, intensity: 'high' })).gates.find((g) => g.key === 'nutrition');
    assert.doesNotMatch(after.detail, /không cho ăn được/, 'the make-up counts as the meal');
    assert.match(after.detail, /cho ăn lúc/, 'the digestion wait now starts from the make-up');
    const notToday = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: 'evening', scheduledDate: day(-1), status: 'skipped', skipReason: 'x' });
    assert.equal((await raw('trainer', 'POST', `/stable/tasks/${notToday._id}/make-up`)).status, 409, 'only today\'s meals');
  });

  await t.test('the trainer deletes a ration; today\'s meal not given yet goes with it, history stays', async () => {
    const upcoming = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: 'morning', scheduledDate: new Date(Date.now() + 30 * 60000) });
    const given = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: 'morning', scheduledDate: new Date(), status: 'completed', completedAt: new Date() });
    const res = await api('trainer', 'DELETE', `/feeding/${morning._id}`);
    assert.equal(res.removedTasks, 1);
    assert.equal(await models.FeedingSchedule.exists({ _id: morning._id }), null);
    assert.equal(await models.DailyTask.exists({ _id: upcoming._id }), null);
    assert.ok(await models.DailyTask.exists({ _id: given._id }), 'what was given stays');
    assert.equal((await raw('owner', 'DELETE', `/feeding/${morning._id}`)).status, 403);
  });
});
