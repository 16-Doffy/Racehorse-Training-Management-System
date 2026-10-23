const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, planFor } = require('../../test-support/integration');

test('a trainer approves one dated feeding calendar for the full training cycle', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('feedingcalendar');
  t.after(() => ctx.close());
  const { api, raw, models, users } = ctx;
  const { horse } = await intake(ctx, 'TEST Feeding Calendar Horse');
  await models.Horse.updateOne({ _id: horse._id }, { $set: { weightKg: 500 } });
  await api('manager', 'POST', '/inventory', { name: 'TEST calendar hay', category: 'feed', unit: 'kg', quantity: 400, feedType: 'forage' }, 201);
  await api('manager', 'POST', '/inventory', { name: 'TEST calendar oats', category: 'feed', unit: 'kg', quantity: 400, feedType: 'concentrate' }, 201);
  const plan = await planFor(ctx, horse, { phases: [
    { key: 'base_building', weeks: 1, distanceTarget: 1600, weeklyVolumeKm: 14, intensity: 'moderate', surface: 'dirt', week: [{ day: 1, kind: 'walk' }] },
    { key: 'strength', weeks: 1, distanceTarget: 1600, weeklyVolumeKm: 18, intensity: 'high', surface: 'dirt', week: [{ day: 1, kind: 'hill' }] },
  ] });
  const route = `/feeding/calendar/${plan._id}`;
  const preview = await api('trainer', 'GET', route);
  assert.equal(preview.days.length, 14);
  assert.equal(preview.days[0].meals.length, 3);
  assert.equal(preview.days[7].phase, 'strength');
  assert.equal(preview.days[0].approved, false);
  assert.equal((await raw('owner', 'GET', route)).status, 403);
  assert.equal((await raw('trainer', 'POST', `${route}/confirm`, { expectedUpdatedAt: preview.plan.updatedAt, times: { evening: '10:00' } })).status, 409);

  const confirmed = await api('trainer', 'POST', `${route}/confirm`, { expectedUpdatedAt: preview.plan.updatedAt, times: { evening: '17:30' } });
  assert.equal(confirmed.days, 14);
  assert.equal(await models.FeedingCalendarDay.countDocuments({ horse: horse._id }), 14);
  const monday = (await models.FeedingCalendarDay.findOne({ horse: horse._id, work: 'moderate' })).meals;
  const rest = (await models.FeedingCalendarDay.findOne({ horse: horse._id, work: 'rest' })).meals;
  assert.ok(monday[0].items[1].amount > rest[0].items[1].amount, 'training day has more concentrate than rest day');
  const editDate = preview.days[3].date;
  const evening = preview.days[3].meals[2];
  await api('trainer', 'PATCH', `${route}/day/${editDate}/evening`, { time: '18:00', items: evening.items.map((item) => ({ inventoryItem: item.inventoryItem, amount: item.amount + 0.5 })) });
  const edited = await models.FeedingCalendarDay.findOne({ horse: horse._id, date: editDate });
  assert.equal(edited.meals[2].time, '18:00');
  assert.equal(edited.meals[2].edited, true);
  const notices = await models.Notification.countDocuments({ recipientUser: users.groom.id, type: 'task_assigned', horse: horse._id });
  const again = await api('trainer', 'POST', `${route}/confirm`, { expectedUpdatedAt: preview.plan.updatedAt });
  assert.equal(again.changed, 0);
  assert.equal((await models.FeedingCalendarDay.findOne({ horse: horse._id, date: editDate })).meals[2].time, '18:00');
  assert.equal(await models.FeedingCalendarDay.countDocuments({ horse: horse._id }), 14);
  assert.equal(await models.Notification.countDocuments({ recipientUser: users.groom.id, type: 'task_assigned', horse: horse._id }), notices);

  const refreshed = await api('trainer', 'GET', route);
  assert.equal(refreshed.days.filter((d) => d.approved).length, 14);
  assert.equal(refreshed.days[0].meals[2].time, '17:30');
  assert.equal(refreshed.days[3].meals[2].time, '18:00');

  // The horse's feeding week: a day ahead as the confirmed calendar has it, a past meal with who gave it.
  const { dateKey } = require('../../src/modules/feeding/feedingCalendar.service');
  const timetable = (day) => api('trainer', 'GET', `/feeding/timetable?horse=${horse._id}&week=${dateKey(day)}`);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const ahead = (await timetable(tomorrow)).days.find((d) => d.date === dateKey(tomorrow));
  assert.deepEqual(ahead.meals.map((m) => `${m.source}:${m.status}:${m.time}`), ['calendar:planned:' + preview.days[1].meals[0].time, 'calendar:planned:' + preview.days[1].meals[1].time, 'calendar:planned:17:30']);
  assert.ok(ahead.meals[0].items.length >= 2, 'what to give, from stock');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(6, 0, 0, 0);
  await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', mealSlot: 'morning', scheduledDate: yesterday, status: 'completed', completedAt: new Date(yesterday.getTime() + 10 * 60000), completedBy: users.groom.id });
  const week = await timetable(yesterday);
  assert.equal(week.caretaker.name, 'TEST groom');
  const past = week.days.find((d) => d.date === dateKey(yesterday));
  assert.deepEqual([past.meals[0].status, past.meals[0].doneBy, past.meals[0].time], ['fed', 'TEST groom', '06:00']);
  assert.equal(past.meals[1].status, null, 'nothing on the list that day');
  assert.equal((await raw('owner', 'GET', `/feeding/timetable?horse=${horse._id}`)).status, 403);
  assert.equal((await raw('trainer', 'GET', `/feeding/timetable?horse=${horse._id}&week=tuesday`)).status, 400);
});
