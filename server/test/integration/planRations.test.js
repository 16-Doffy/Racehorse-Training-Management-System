const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, planFor, day } = require('../../test-support/integration');

// Rations from the training plan: the trainer confirms a horse's three meals in one click, now or
// from the next phase's first day (they take over that day), and is reminded before a phase change.
test('plan rations: one click for three meals, confirmed ahead for the next phase, a reminder', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('planrations');
  t.after(() => ctx.close());
  const { api, raw, users, models } = ctx;
  const { horse } = await intake(ctx, 'TEST Plan Ration Horse');
  const hay = await api('manager', 'POST', '/inventory', { name: 'TEST cỏ khô', category: 'feed', unit: 'kg', quantity: 300, feedType: 'forage' }, 201);
  const oats = await api('manager', 'POST', '/inventory', { name: 'TEST yến mạch', category: 'feed', unit: 'kg', quantity: 300, feedType: 'concentrate' }, 201);
  const meal = (mealTime, timeOfDay, forage, grain) => ({ mealTime, timeOfDay, items: [{ inventoryItem: hay._id, amount: forage }, { inventoryItem: oats._id, amount: grain }] });
  const day3 = (forage, grain) => [meal('morning', '06:00', forage, grain), meal('noon', '11:30', forage, grain), meal('evening', '17:30', forage, grain)];
  const rationOf = (mealTime) => models.FeedingSchedule.findOne({ horse: horse._id, mealTime });

  await t.test('now: three rations in one click, approved by the trainer, then changed in one click', async () => {
    await api('trainer', 'POST', '/feeding/plan', { horse: horse._id, basis: 'Nền tảng · tập vừa', meals: day3(2, 1.5) });
    const made = await models.FeedingSchedule.find({ horse: horse._id });
    assert.equal(made.length, 3);
    assert.ok(made.every((r) => String(r.approvedBy) === users.trainer.id));
    await api('trainer', 'POST', '/feeding/plan', { horse: horse._id, meals: day3(2.5, 2) });
    assert.equal(await models.FeedingSchedule.countDocuments({ horse: horse._id }), 3, 'updated, not added');
    assert.equal((await rationOf('noon')).items[1].amount, 2);
  });

  await t.test('refused: meals closer than the club allows, a horse that is not theirs to feed', async () => {
    const close = await raw('trainer', 'POST', '/feeding/plan', { horse: horse._id, meals: [meal('morning', '10:30', 1, 1)] });
    assert.equal(close.status, 400);
    assert.match(close.body.message, /cách nhau chưa đủ 3 giờ/);
    assert.equal((await rationOf('morning')).timeOfDay, '06:00', 'nothing saved');
    assert.equal((await raw('owner', 'POST', '/feeding/plan', { horse: horse._id, meals: day3(1, 1) })).status, 403);
    assert.equal((await raw('trainer', 'POST', '/feeding/plan', { horse: horse._id, meals: [] })).status, 400);
  });

  await t.test('ahead: the next phase\'s amounts wait, then replace the meals on their day', async () => {
    await api('trainer', 'POST', '/feeding/plan', { horse: horse._id, from: day(3).toISOString(), basis: 'Sức mạnh · tập nặng', meals: day3(1.5, 2.5) });
    let morning = await rationOf('morning');
    assert.equal(morning.items[0].amount, 2.5, 'today unchanged');
    assert.equal(morning.upcoming.items[0].amount, 1.5);
    assert.equal(morning.upcoming.basis, 'Sức mạnh · tập nặng');
    // That day comes.
    await models.FeedingSchedule.updateMany({ horse: horse._id }, { $set: { 'upcoming.from': new Date(Date.now() - 60000) } });
    const { ensureFeedingTasks } = require('../../src/realtime/dailyTaskGenerator');
    await ensureFeedingTasks({ horseIds: [horse._id] });
    morning = await rationOf('morning');
    assert.equal(morning.items[0].amount, 1.5);
    assert.equal(morning.upcoming, null);
  });

  await t.test('a phase change within two days tells the trainer once; amounts set ahead stop it', async () => {
    const { remindRationReviews } = require('../../src/modules/feeding/planRations.service');
    const plan = await planFor(ctx, horse, {
      phases: [
        { key: 'base_building', weeks: 1, distanceTarget: 1600, weeklyVolumeKm: 14, intensity: 'moderate', surface: 'dirt', week: [] },
        { key: 'strength', weeks: 2, distanceTarget: 1600, weeklyVolumeKm: 16, intensity: 'high', surface: 'dirt', week: [] },
      ],
    });
    // The second phase starts tomorrow.
    await models.TrainingPlan.updateOne({ _id: plan._id }, { $set: { 'phases.0.startDate': day(-6), 'phases.0.endDate': new Date(day(1).getTime() - 1), 'phases.1.startDate': day(1) } });
    assert.equal(await remindRationReviews(), 1);
    const note = await models.Notification.findOne({ type: 'ration_review', horse: horse._id });
    assert.equal(String(note.recipientUser), users.trainer.id);
    assert.match(note.message, /sang giai đoạn Sức mạnh/);
    assert.equal(await remindRationReviews(), 0, 'once');

    await models.Notification.deleteMany({ type: 'ration_review' });
    await api('trainer', 'POST', '/feeding/plan', { horse: horse._id, from: day(1).toISOString(), meals: day3(1.5, 3) });
    assert.equal(await remindRationReviews(), 0, 'already set for that day');
  });

  await t.test('one meal suggested from today\'s phase and work, the stock and the horse\'s weight', async () => {
    await models.Horse.updateOne({ _id: horse._id }, { $set: { weightKg: 480 } });
    await api('manager', 'POST', '/inventory', { name: 'TEST khoáng chất', category: 'feed', unit: 'kg', quantity: 10, feedType: 'supplement' }, 201);
    const route = (slot) => `/feeding/suggest?horse=${horse._id}&slot=${slot}`;
    const evening = await api('trainer', 'GET', route('evening'));
    // Today is in the base phase, whose week template trains on no day: a rest day.
    assert.equal(evening.phase, 'base_building');
    assert.equal(evening.work, 'rest');
    assert.equal(evening.warning, null);
    assert.deepEqual(evening.daily, { forage: 10, concentrate: 1.5 });
    assert.deepEqual(evening.items.map((i) => [i.name, i.amount]), [['TEST cỏ khô', 5], ['TEST yến mạch', 0.5], ['TEST khoáng chất', 0.05]]);
    assert.equal((await api('trainer', 'GET', route('morning'))).items.length, 2, 'supplements go in the evening');

    await models.Horse.updateOne({ _id: horse._id }, { $set: { weightKg: 200 } });
    assert.match((await api('trainer', 'GET', route('noon'))).warning, /200 kg bất thường/);
    assert.equal((await raw('owner', 'GET', route('noon'))).status, 403);
    assert.equal((await raw('trainer', 'GET', route('brunch'))).status, 400);
  });
});
