const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, planFor } = require('../../test-support/integration');
const { RAMP } = require('../../src/modules/feeding/dietOrder');

test('meals follow health: the sick diet while injured, the plan\'s meals or the old ration back once fit, a week to build up', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('healthdiet');
  t.after(() => ctx.close());
  const { api, models, users } = ctx;
  await api('manager', 'POST', '/inventory', { name: 'TEST diet hay', category: 'feed', unit: 'kg', quantity: 2000, feedType: 'forage' }, 201);
  const oats = await api('manager', 'POST', '/inventory', { name: 'TEST diet oats', category: 'feed', unit: 'kg', quantity: 2000, feedType: 'concentrate' }, 201);
  await api('manager', 'POST', '/inventory', { name: 'TEST điện giải', category: 'feed', unit: 'kg', quantity: 50, feedType: 'supplement' }, 201);
  const exam = (horse, resultStatus, extra = {}) => api('vet', 'POST', '/health/records', {
    horse: horse._id, diagnosis: `TEST ${resultStatus}`, resultStatus,
    ...(resultStatus === 'eligible' ? { clearedLevel: 'high' } : {}), vitalSigns: { temperatureC: 37.9, heartRate: 38 }, ...extra,
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

  // An exam's conclusion and what follows from it must agree.
  await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST', resultStatus: 'injured', clearedLevel: 'high' }, 400);
  await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST', resultStatus: 'quarantined', clearedLevel: 'light' }, 400);
  await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST', resultStatus: 'injured', dietPlan: { kind: 'plan' } }, 400);
  await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST', resultStatus: 'injured', dietPlan: { kind: 'chocolate' } }, 400);

  // Injured, no diet ordered: box rest on every day ahead — less grain, no electrolytes — and the trainer is told.
  await exam(horse, 'injured');
  const sick = await ahead();
  assert.ok(sick.every((d) => d.diet === 'sick' && d.sickKind === 'rest'), 'all days ahead on box rest');
  assert.ok(oatsOf(sick[0].meals) < hardOats, 'less grain than on a hard day');
  assert.ok(!sick[0].meals.flatMap((m) => m.items).some((i) => /điện giải/.test(i.name)), 'no electrolytes');
  assert.ok(await models.Notification.exists({ horse: horse._id, type: 'ration_review', message: /chế độ "Nghỉ chuồng"/ }));
  assert.ok(await models.Notification.exists({ recipientUser: users.groom.id, horse: horse._id, message: /chế độ "Nghỉ chuồng"/ }));
  const view = await api('trainer', 'GET', route);
  assert.equal(view.diet, 'sick');
  assert.equal(view.sickKind, 'rest');

  // The vet orders the colic diet: no grain at all, the groom reads the order and the vet's words.
  await exam(horse, 'injured', { dietPlan: { kind: 'colic', note: 'Ngâm cỏ 30 phút' } });
  const colic = await ahead();
  assert.ok(colic.every((d) => d.diet === 'sick' && d.sickKind === 'colic'));
  assert.equal(oatsOf(colic[0].meals), 0, 'no concentrate after colic');
  assert.ok(await models.Notification.exists({ recipientUser: users.groom.id, horse: horse._id, message: /Đau bụng \(colic\).*Bác sĩ dặn: Ngâm cỏ 30 phút/ }));
  const seen = await api('groom', 'GET', `/horses/${horse._id}`);
  assert.equal(seen.feedingDiet.kind, 'colic');
  assert.equal(seen.feedingDiet.note, 'Ngâm cỏ 30 phút');
  assert.equal((await api('trainer', 'GET', route)).sickKind, 'colic');

  // Under monitoring without an order it stays on it; with 'plan' it eats as planned again.
  await exam(horse, 'monitoring');
  assert.ok((await ahead()).every((d) => d.diet === 'sick' && d.sickKind === 'colic'), 'monitoring keeps the vet\'s diet');
  await exam(horse, 'monitoring', { dietPlan: { kind: 'plan' } });
  assert.ok((await ahead()).every((d) => d.diet === 'normal'), 'the vet lets it eat as planned');
  await exam(horse, 'injured', { dietPlan: { kind: 'ulcer' } });
  assert.ok((await ahead()).every((d) => d.sickKind === 'ulcer'));

  // Found fit: the plan's meals come back, the grain building up over a week; the vet's order is over.
  await exam(horse, 'eligible');
  const fit = await models.Horse.findById(horse._id).lean();
  assert.equal(fit.vetDiet, null);
  assert.ok(fit.backToFeedAt, 'the week back starts today');
  const back = await ahead();
  assert.ok(back.every((d) => d.diet === 'normal'));
  assert.ok(oatsOf(back[0].meals) < hardOats, 'part of the grain on the first days back');
  assert.ok(oatsOf(back[0].meals) > 0);
  assert.equal(oatsOf(back[RAMP.length].meals), hardOats, 'the whole ration once the week is over');
  assert.match(back[0].meals.length ? (await api('trainer', 'GET', route)).days.find((d) => d.date === back[0].date).rationNote : '', /^Tập ăn lại sau bệnh/);
  assert.equal((await api('groom', 'GET', `/horses/${horse._id}`)).feedingDiet.diet, 'ramp');
  assert.ok(await models.Notification.exists({ recipientUser: users.groom.id, horse: horse._id, message: /tăng dần trong 7 ngày/ }));

  // A horse on daily rations: they take the sick meals, and get their own items back once fit — its grain halved first.
  const { horse: daily } = await intake(ctx, 'TEST Diet Daily Horse');
  await models.Horse.updateOne({ _id: daily._id }, { $set: { weightKg: 500 } });
  const own = [{ inventoryItem: oats._id, amount: 2 }];
  await api('trainer', 'POST', '/feeding/plan', { horse: daily._id, meals: [{ mealTime: 'morning', timeOfDay: '06:00', items: own }, { mealTime: 'evening', timeOfDay: '17:30', items: own }] });
  const rations = () => models.FeedingSchedule.find({ horse: daily._id }).sort({ mealTime: 1 }).lean();
  await exam(daily, 'injured');
  const onSick = await rations();
  assert.ok(onSick.every((r) => r.healthyItems?.length === 1 && r.healthyItems[0].amount === 2), 'own items kept aside');
  assert.ok(onSick.every((r) => r.items.some((i) => /hay/.test(i.type))), 'the sick meals: forage first');
  assert.ok(onSick.every((r) => r.sickKind === 'rest'));
  // Another order: the meals change again, the own items still kept aside.
  await exam(daily, 'injured', { dietPlan: { kind: 'laminitis' } });
  const laminitis = await rations();
  assert.ok(laminitis.every((r) => r.sickKind === 'laminitis' && r.healthyItems[0].amount === 2));
  assert.ok(laminitis.every((r) => !r.items.some((i) => String(i.inventoryItem) === String(oats._id))), 'no grain with laminitis');
  await exam(daily, 'eligible');
  const restored = await rations();
  assert.ok(restored.every((r) => !r.healthyItems?.length && r.fullItems?.[0]?.amount === 2), 'own items back, kept whole');
  assert.ok(restored.every((r) => r.items.length === 1 && r.items[0].amount === 1), 'half the grain on the first day');
  // A week later the hourly run gives the whole ration back.
  await models.Horse.updateOne({ _id: daily._id }, { backToFeedAt: new Date(Date.now() - RAMP.length * 86400000) });
  await require('../../src/modules/feeding/feedingCalendar.service').retryHealthDiets();
  const whole = await rations();
  assert.ok(whole.every((r) => r.items[0].amount === 2 && !r.fullItems?.length), 'the whole ration again');
});
