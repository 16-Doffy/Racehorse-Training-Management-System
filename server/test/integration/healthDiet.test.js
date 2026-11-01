const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, planFor } = require('../../test-support/integration');

test('meals follow health: the sick diet while injured, the plan\'s meals or the old ration back once fit', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('healthdiet');
  t.after(() => ctx.close());
  const { api, models, users } = ctx;
  await api('manager', 'POST', '/inventory', { name: 'TEST diet hay', category: 'feed', unit: 'kg', quantity: 2000, feedType: 'forage' }, 201);
  const oats = await api('manager', 'POST', '/inventory', { name: 'TEST diet oats', category: 'feed', unit: 'kg', quantity: 2000, feedType: 'concentrate' }, 201);
  await api('manager', 'POST', '/inventory', { name: 'TEST điện giải', category: 'feed', unit: 'kg', quantity: 50, feedType: 'supplement' }, 201);
  const exam = (horse, resultStatus) => api('vet', 'POST', '/health/records', {
    horse: horse._id, diagnosis: `TEST ${resultStatus}`, resultStatus,
    ...(resultStatus === 'eligible' ? { clearedLevel: 'high' } : {}), vitalSigns: { temperatureC: 37.9, heartRate: 38 },
  }, 201);
  const today = () => require('../../src/modules/feeding/feedingCalendar.service').dateKey(new Date());
  const oatsOf = (meals) => meals.flatMap((m) => m.items).filter((i) => String(i.inventoryItem) === String(oats._id)).reduce((n, i) => n + i.amount, 0);

  // A horse on its plan's calendar, hard work every day.
  const { horse } = await intake(ctx, 'TEST Diet Plan Horse');
  await models.Horse.updateOne({ _id: horse._id }, { $set: { weightKg: 500 } });
  const plan = await planFor(ctx, horse, { phases: [{ key: 'speed', weeks: 2, distanceTarget: 1600, weeklyVolumeKm: 18, intensity: 'high', surface: 'dirt', week: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, kind: 'breeze' })) }] });
  const route = `/feeding/calendar/${plan._id}`;
  const preview = await api('trainer', 'GET', route);
  await api('trainer', 'POST', `${route}/confirm`, { expectedUpdatedAt: preview.plan.updatedAt });
  const ahead = () => models.FeedingCalendarDay.find({ horse: horse._id, date: { $gt: today() } }).sort({ date: 1 }).lean();
  const healthy = await ahead();
  assert.ok(healthy.every((d) => d.diet === 'normal'));
  const hardOats = oatsOf(healthy[0].meals);

  // Injured: every day ahead on the sick diet — less grain, no electrolytes — and the trainer is told.
  await exam(horse, 'injured');
  const sick = await ahead();
  assert.ok(sick.every((d) => d.diet === 'sick'), 'all days ahead on the sick diet');
  assert.ok(oatsOf(sick[0].meals) < hardOats, 'less grain than on a hard day');
  assert.ok(!sick[0].meals.flatMap((m) => m.items).some((i) => /điện giải/.test(i.name)), 'no electrolytes');
  assert.ok(await models.Notification.exists({ horse: horse._id, type: 'ration_review', message: /chế độ ăn khi bệnh/ }));
  assert.ok(await models.Notification.exists({ recipientUser: users.groom.id, horse: horse._id, message: /chế độ ăn khi bệnh/ }));
  const view = await api('trainer', 'GET', route);
  assert.equal(view.diet, 'sick');

  // Under monitoring it stays on it; found fit, the plan's meals come back.
  await exam(horse, 'monitoring');
  assert.ok((await ahead()).every((d) => d.diet === 'sick'), 'monitoring keeps the sick diet');
  await exam(horse, 'eligible');
  const back = await ahead();
  assert.ok(back.every((d) => d.diet === 'normal'));
  assert.equal(oatsOf(back[0].meals), hardOats, 'the plan\'s meals again');

  // A horse on daily rations: they take the sick meals, and get their own items back once fit.
  const { horse: daily } = await intake(ctx, 'TEST Diet Daily Horse');
  await models.Horse.updateOne({ _id: daily._id }, { $set: { weightKg: 500 } });
  const own = [{ inventoryItem: oats._id, amount: 2 }];
  await api('trainer', 'POST', '/feeding/plan', { horse: daily._id, meals: [{ mealTime: 'morning', timeOfDay: '06:00', items: own }, { mealTime: 'evening', timeOfDay: '17:30', items: own }] });
  const rations = () => models.FeedingSchedule.find({ horse: daily._id }).sort({ mealTime: 1 }).lean();
  await exam(daily, 'injured');
  const onSick = await rations();
  assert.ok(onSick.every((r) => r.healthyItems?.length === 1 && r.healthyItems[0].amount === 2), 'own items kept aside');
  assert.ok(onSick.every((r) => r.items.some((i) => /hay/.test(i.type))), 'the sick meals: forage first');
  await exam(daily, 'eligible');
  const restored = await rations();
  assert.ok(restored.every((r) => r.items.length === 1 && r.items[0].amount === 2 && !r.healthyItems?.length), 'own items back');
});
