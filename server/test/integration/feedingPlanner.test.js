const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, planFor } = require('../../test-support/integration');

test('the ration planner confirms the days the trainer changed, left out or set back to the suggestion', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('feedingplanner');
  t.after(() => ctx.close());
  const { api, raw, models } = ctx;
  const { horse } = await intake(ctx, 'TEST Feeding Planner Horse');
  await models.Horse.updateOne({ _id: horse._id }, { $set: { weightKg: 500 } });
  await api('manager', 'POST', '/inventory', { name: 'TEST planner hay', category: 'feed', unit: 'kg', quantity: 900, feedType: 'forage' }, 201);
  const oats = await api('manager', 'POST', '/inventory', { name: 'TEST planner oats', category: 'feed', unit: 'kg', quantity: 900, feedType: 'concentrate' }, 201);
  const plan = await planFor(ctx, horse, { phases: [
    { key: 'base_building', weeks: 1, distanceTarget: 1600, weeklyVolumeKm: 14, intensity: 'moderate', surface: 'dirt', week: [{ day: 1, kind: 'canter' }, { day: 3, kind: 'walk' }] },
    { key: 'strength', weeks: 1, distanceTarget: 1600, weeklyVolumeKm: 18, intensity: 'high', surface: 'dirt', week: [{ day: 2, kind: 'hill' }] },
  ] });
  const route = `/feeding/calendar/${plan._id}`;
  const preview = await api('trainer', 'GET', route);
  assert.equal(preview.phases.length, 2);
  assert.equal(preview.clocks.morning, '06:00');
  const ahead = preview.days.filter((d) => !d.past);
  assert.ok(ahead.length >= 8, 'two weeks from today');
  const trainingDay = ahead.find((d) => d.work !== 'rest');
  assert.ok(trainingDay.sessions.length >= 1, 'the work of the day beside its meals');
  assert.deepEqual(ahead[1].suggested.map((m) => m.slot), ['morning', 'noon', 'evening']);
  assert.deepEqual(ahead[1].removedSlots, []);

  // Day A: more oats in the evening; day B: no lunch; day C: one meal of the trainer's own.
  const [dayA, dayB, dayC] = [ahead[1], ahead[2], ahead[3]];
  const lines = (meal) => meal.items.map((i) => ({ inventoryItem: i.inventoryItem, amount: i.amount }));
  const asSent = (day) => day.meals.map((m) => ({ slot: m.slot, time: m.time, items: lines(m) }));
  const eveningA = dayA.meals.find((m) => m.slot === 'evening');
  const days = [
    { date: dayA.date, meals: asSent(dayA).map((m) => (m.slot === 'evening' ? { ...m, items: m.items.map((i) => (String(i.inventoryItem) === String(oats._id) ? { ...i, amount: i.amount + 1 } : i)) } : m)) },
    { date: dayB.date, meals: asSent(dayB).filter((m) => m.slot !== 'noon') },
    { date: dayC.date, meals: [{ slot: 'evening', time: '18:00', items: [{ inventoryItem: oats._id, amount: 2 }] }] },
  ];
  const bad = (body) => raw('trainer', 'POST', `${route}/confirm`, { expectedUpdatedAt: preview.plan.updatedAt, ...body });
  assert.equal((await bad({ days: [{ date: '2001-01-01', meals: days[2].meals }] })).status, 400, 'a day outside the plan');
  assert.equal((await bad({ days: [{ date: dayC.date, meals: [] }] })).status, 400, 'a day without meals');
  assert.equal((await bad({ days: [{ date: dayC.date, meals: [{ slot: 'noon', time: '19:00', items: lines(eveningA) }] }] })).status, 400, 'lunch at 19:00');
  assert.equal((await bad({ days: [{ date: dayC.date, meals: [days[2].meals[0], days[2].meals[0]] }] })).status, 400, 'the same meal twice');
  assert.equal((await bad({ days: [{ date: dayC.date, meals: [{ slot: 'evening', time: '18:00', items: [{ inventoryItem: '0123456789abcdef01234567', amount: 1 }] }] }] })).status, 400, 'an item not in stock');
  assert.equal((await bad({ days: [days[0], days[0]] })).status, 400, 'a day twice');
  assert.equal(await models.FeedingCalendarDay.countDocuments({ horse: horse._id }), 0, 'nothing saved by a refused confirmation');

  const confirmed = await api('trainer', 'POST', `${route}/confirm`, { expectedUpdatedAt: preview.plan.updatedAt, times: { morning: '06:30' }, days });
  assert.equal(confirmed.days, ahead.length);
  const saved = async (date) => models.FeedingCalendarDay.findOne({ horse: horse._id, date }).lean();
  const a = await saved(dayA.date);
  const savedEvening = a.meals.find((m) => m.slot === 'evening');
  assert.equal(savedEvening.items.find((i) => String(i.inventoryItem) === String(oats._id)).amount, eveningA.items.find((i) => String(i.inventoryItem) === String(oats._id)).amount + 1);
  assert.equal(savedEvening.edited, true);
  assert.equal(a.meals.find((m) => m.slot === 'noon').edited, false, 'a meal left as suggested is not marked');
  const b = await saved(dayB.date);
  assert.deepEqual(b.meals.map((m) => m.slot), ['morning', 'evening']);
  assert.deepEqual(b.removedSlots, ['noon']);
  const c = await saved(dayC.date);
  assert.deepEqual(c.meals.map((m) => `${m.slot}:${m.time}:${m.items.length}`), ['evening:18:00:1']);
  const untouched = await saved(ahead.at(-1).date);
  assert.equal(untouched.meals.find((m) => m.slot === 'morning').time, '06:30', 'the new breakfast time on every day');

  // Read back as saved, then confirmed again unchanged: the trainer's days stay as they set them.
  const view = await api('trainer', 'GET', route);
  const viewB = view.days.find((d) => d.date === dayB.date);
  assert.equal(viewB.approved, true);
  assert.deepEqual(viewB.removedSlots, ['noon']);
  assert.ok(viewB.suggested.some((m) => m.slot === 'noon'), 'the suggestion stays beside it');
  const again = await api('trainer', 'POST', `${route}/confirm`, { expectedUpdatedAt: preview.plan.updatedAt });
  assert.equal(again.changed, 0);

  // The plan changes: confirming its new version keeps the meals the trainer edited and left out.
  await models.TrainingPlan.updateOne({ _id: plan._id }, { $set: { goal: 'Changed goal' } });
  const changedPlan = await api('trainer', 'GET', route);
  assert.ok(changedPlan.days.find((d) => d.date === dayB.date).stale);
  await api('trainer', 'POST', `${route}/confirm`, { expectedUpdatedAt: changedPlan.plan.updatedAt });
  assert.deepEqual((await saved(dayB.date)).meals.map((m) => m.slot), ['morning', 'evening']);
  assert.equal((await saved(dayA.date)).meals.find((m) => m.slot === 'evening').edited, true);

  // Back to the suggestion: every day as the rules give it again.
  await api('trainer', 'POST', `${route}/confirm`, { expectedUpdatedAt: changedPlan.plan.updatedAt, fresh: true });
  const reset = await saved(dayB.date);
  assert.deepEqual(reset.meals.map((m) => m.slot), ['morning', 'noon', 'evening']);
  assert.deepEqual(reset.removedSlots, []);
  assert.equal((await saved(dayA.date)).meals.some((m) => m.edited), false);

  // The three meals the rules suggest today, at once.
  const suggestion = await api('trainer', 'GET', `/feeding/suggest?horse=${horse._id}`);
  assert.deepEqual(suggestion.meals.map((m) => m.slot), ['morning', 'noon', 'evening']);
  assert.equal((await raw('trainer', 'GET', `/feeding/suggest?horse=${horse._id}&slot=supper`)).status, 400);

  // A closed plan's calendar no longer holds the horse's daily rations back.
  const meal = { mealTime: 'evening', timeOfDay: '17:30', items: [{ inventoryItem: oats._id, amount: 2 }] };
  assert.equal((await raw('trainer', 'POST', '/feeding/plan', { horse: horse._id, meals: [meal] })).status, 409);
  await models.TrainingPlan.updateOne({ _id: plan._id }, { $set: { status: 'cancelled' } });
  await api('trainer', 'POST', '/feeding/plan', { horse: horse._id, meals: [meal] });
});
