const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, planFor } = require('../../test-support/integration');

// What happens when the automation cannot do its work: nothing stays silent, the vet's exam is never lost.
test('moves and meals that follow health say so when they cannot, and try again', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('healthfollow');
  t.after(() => ctx.close());
  const { api, raw, models, users } = ctx;
  const { retryWaitingMoves } = require('../../src/modules/stable/healthPlacement.service');
  const { retryHealthDiets, dateKey } = require('../../src/modules/feeding/feedingCalendar.service');
  const realClaim = models.Stall.claim;
  t.after(() => { models.Stall.claim = realClaim; });

  await api('manager', 'POST', '/inventory', { name: 'TEST follow hay', category: 'feed', unit: 'kg', quantity: 5000, feedType: 'forage' }, 201);
  const oats = await api('manager', 'POST', '/inventory', { name: 'TEST follow oats', category: 'feed', unit: 'kg', quantity: 5000, feedType: 'concentrate' }, 201);
  const a = await api('manager', 'POST', '/stable/stalls/generate', { zone: 'A', count: 8, zoneName: 'Khu A' }, 201);
  await api('manager', 'POST', '/stable/stalls/generate', { zone: 'R', count: 1, zoneName: 'Khu hồi phục', type: 'recovery' }, 201);
  await api('manager', 'POST', '/stable/stalls/generate', { zone: 'Q', count: 1, zoneName: 'Khu cách ly', type: 'isolation' }, 201);
  let nextStall = 0;
  const place = async (name) => {
    const { horse } = await intake(ctx, name);
    await models.Horse.updateOne({ _id: horse._id }, { $set: { weightKg: 500 } });
    await api('manager', 'POST', '/stable/assignments', { horse: horse._id, stall: a.created[nextStall]._id, assignedCaretaker: users.groom.id }, 201);
    nextStall += 1;
    return horse;
  };
  const exam = (horse, resultStatus) => raw('vet', 'POST', '/health/records', {
    horse: horse._id, diagnosis: `TEST ${resultStatus}`, resultStatus,
    ...(resultStatus === 'eligible' ? { clearedLevel: 'high' } : {}), vitalSigns: { temperatureC: 37.9, heartRate: 38 },
  });
  const where = async (horse) => {
    const asg = await models.StableAssignment.findOne({ horse: horse._id }).populate('stall', 'code').populate('homeStall', 'code').lean();
    return { stall: asg.stall?.code, home: asg.homeStall?.code || null, pending: asg.pendingMove };
  };
  const planOf = (horse) => planFor(ctx, horse, { phases: [{ key: 'speed', weeks: 2, distanceTarget: 1600, weeklyVolumeKm: 18, intensity: 'high', surface: 'dirt', week: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, kind: 'breeze' })) }] });
  const managerTold = (horse, message) => models.Notification.countDocuments({ horse: horse._id, recipientRole: 'manager', message });
  const hayOff = () => models.InventoryItem.updateMany({ feedType: 'forage' }, { $set: { isActive: false } });
  const hayOn = () => models.InventoryItem.updateMany({ feedType: 'forage' }, { $set: { isActive: true } });

  // The move goes wrong: the vet still gets their exam saved, once; the move waits, the Manager is told, the meals change.
  const broken = await place('TEST Move Breaks');
  const brokenPlan = await planOf(broken);
  const brokenRoute = `/feeding/calendar/${brokenPlan._id}`;
  await api('trainer', 'POST', `${brokenRoute}/confirm`, { expectedUpdatedAt: (await api('trainer', 'GET', brokenRoute)).plan.updatedAt });
  models.Stall.claim = async () => { throw new Error('TEST the stall could not be written'); };
  const answer = await exam(broken, 'injured');
  models.Stall.claim = realClaim;
  assert.equal(answer.status, 201, 'the exam is saved and the vet is not told it failed');
  assert.equal(await models.HealthRecord.countDocuments({ horse: broken._id, resultStatus: 'injured' }), 1);
  assert.deepEqual(await where(broken), { stall: 'A-01', home: null, pending: 'recovery' });
  assert.equal(await managerTold(broken, /chưa chuyển được/), 1);
  assert.equal((await models.FeedingCalendarDay.findOne({ horse: broken._id, date: { $gt: dateKey(new Date()) } }).lean()).diet, 'sick', 'its meals still follow');
  assert.equal(await retryWaitingMoves(), 1);
  assert.deepEqual(await where(broken), { stall: 'R-01', home: 'A-01', pending: null });
  assert.equal((await exam(broken, 'eligible')).status, 201);
  assert.deepEqual(await where(broken), { stall: 'A-01', home: null, pending: null });

  // Another horse takes the stall at the last moment: this one waits and the Manager hears, instead of nothing happening.
  const late = await place('TEST Stall Taken');
  models.Stall.claim = async () => null;
  assert.equal((await exam(late, 'injured')).status, 201);
  models.Stall.claim = realClaim;
  assert.deepEqual(await where(late), { stall: 'A-02', home: null, pending: 'recovery' });
  assert.equal(await managerTold(late, /chưa có chuồng hồi phục trống/), 1);
  assert.equal(await retryWaitingMoves(), 1);
  assert.deepEqual(await where(late), { stall: 'R-01', home: 'A-02', pending: null });

  // Who waits is on the map's answer, for those who may see the horse; a stall freed moves them at once, on the record.
  const waiter = await place('TEST Waits');
  assert.equal((await exam(waiter, 'injured')).status, 201);
  assert.deepEqual(await where(waiter), { stall: 'A-03', home: null, pending: 'recovery' });
  const map = await api('manager', 'GET', '/stable/stalls');
  assert.deepEqual(map.waiting.map((w) => [w.horse.name, w.wants, w.now]), [['TEST Waits', 'recovery', 'A-03']]);
  assert.equal((await exam(late, 'eligible')).status, 201);
  assert.deepEqual(await where(late), { stall: 'A-02', home: null, pending: null });
  assert.deepEqual(await where(waiter), { stall: 'R-01', home: 'A-03', pending: null }, 'moved as soon as the stall came free');
  assert.deepEqual((await api('manager', 'GET', '/stable/stalls')).waiting, []);
  const waiterAssignment = await models.StableAssignment.findOne({ horse: waiter._id }).lean();
  const onRecord = await models.AuditLog.findOne({ action: 'stableAssignment.follow_health', targetId: waiterAssignment._id }).lean();
  assert.equal(onRecord.actor, null, 'done by the system, and on the record');
  assert.equal(onRecord.metadata.bySystem, true);

  // A horse waiting found under monitoring no longer waits for anything.
  const other = await place('TEST Waits Then Better');
  await exam(other, 'injured');
  assert.equal((await where(other)).pending, 'recovery');
  await exam(other, 'monitoring');
  assert.equal((await where(other)).pending, null);

  // A new stall of the kind is taken at once by a horse waiting for one.
  await exam(other, 'injured');
  assert.equal((await where(other)).pending, 'recovery');
  await api('manager', 'POST', '/stable/stalls/generate', { zone: 'S', count: 1, zoneName: 'Khu hồi phục 2', type: 'recovery' }, 201);
  assert.deepEqual(await where(other), { stall: 'S-01', home: 'A-04', pending: null });

  // The Manager puts an injured horse back in an ordinary stall: a follow-up with the same conclusion leaves it,
  // a changed conclusion moves it again.
  assert.equal((await raw('manager', 'POST', '/stable/assignments', { horse: other._id, stall: a.created[3]._id, assignedCaretaker: users.groom.id })).status, 201);
  assert.deepEqual(await where(other), { stall: 'A-04', home: null, pending: null });
  await exam(other, 'injured');
  assert.deepEqual(await where(other), { stall: 'A-04', home: null, pending: null }, 'the same conclusion: stays where the Manager put it');
  await exam(other, 'monitoring');
  await exam(other, 'injured');
  assert.deepEqual(await where(other), { stall: 'S-01', home: 'A-04', pending: null }, 'the conclusion changed: moves');

  // No forage in the store, a horse on its plan's calendar: it stays on its meals, the trainer and the Manager hear why,
  // once; the hourly run changes the meals when there is forage again.
  const hungry = await place('TEST No Hay Calendar');
  const hungryPlan = await planOf(hungry);
  const hungryRoute = `/feeding/calendar/${hungryPlan._id}`;
  await api('trainer', 'POST', `${hungryRoute}/confirm`, { expectedUpdatedAt: (await api('trainer', 'GET', hungryRoute)).plan.updatedAt });
  const dietAhead = async (horse) => (await models.FeedingCalendarDay.findOne({ horse: horse._id, date: { $gt: dateKey(new Date()) } }).sort({ date: 1 }).lean()).diet;
  await hayOff();
  assert.equal((await exam(hungry, 'injured')).status, 201);
  assert.equal(await dietAhead(hungry), 'normal');
  const stuck = /chưa đổi được khẩu phần sang chế độ ăn khi bệnh: Kho chưa có cỏ/;
  assert.equal(await managerTold(hungry, stuck), 1);
  assert.ok(await models.Notification.exists({ horse: hungry._id, recipientUser: users.trainer.id, type: 'ration_review', message: stuck }));
  await retryHealthDiets();
  assert.equal(await managerTold(hungry, stuck), 1, 'said once a day, not every hour');
  assert.equal(await dietAhead(hungry), 'normal');
  await hayOn();
  await retryHealthDiets();
  assert.equal(await dietAhead(hungry), 'sick', 'changed once there is forage');
  assert.ok(await models.Notification.exists({ horse: hungry._id, recipientUser: users.trainer.id, message: /đã chuyển sang chế độ ăn khi bệnh/ }));

  // The same for a horse on daily rations: its own meals stay, nothing is half done.
  const daily = await place('TEST No Hay Daily');
  const own = [{ inventoryItem: oats._id, amount: 2 }];
  await api('trainer', 'POST', '/feeding/plan', { horse: daily._id, meals: [{ mealTime: 'morning', timeOfDay: '06:00', items: own }, { mealTime: 'evening', timeOfDay: '17:30', items: own }] });
  await hayOff();
  await exam(daily, 'injured');
  const rations = () => models.FeedingSchedule.find({ horse: daily._id }).lean();
  assert.ok((await rations()).every((r) => r.items.length === 1 && !r.healthyItems?.length));
  assert.equal(await managerTold(daily, stuck), 1);
  await hayOn();
  await retryHealthDiets();
  assert.ok((await rations()).every((r) => r.healthyItems?.length === 1 && r.items.some((i) => /hay/.test(i.type))));
  await exam(daily, 'eligible');
  assert.ok((await rations()).every((r) => r.items.length === 1 && r.items[0].amount === 2 && !r.healthyItems?.length));
});

test('what the trainer changed on the calendar comes back after an illness, and a fresh start drops it', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('healthfollowedits');
  t.after(() => ctx.close());
  const { api, models } = ctx;
  const { dateKey } = require('../../src/modules/feeding/feedingCalendar.service');
  await api('manager', 'POST', '/inventory', { name: 'TEST edits hay', category: 'feed', unit: 'kg', quantity: 5000, feedType: 'forage' }, 201);
  const oats = await api('manager', 'POST', '/inventory', { name: 'TEST edits oats', category: 'feed', unit: 'kg', quantity: 5000, feedType: 'concentrate' }, 201);
  const { horse } = await intake(ctx, 'TEST Edits Survive');
  await models.Horse.updateOne({ _id: horse._id }, { $set: { weightKg: 500 } });
  const plan = await planFor(ctx, horse, { phases: [{ key: 'speed', weeks: 2, distanceTarget: 1600, weeklyVolumeKm: 18, intensity: 'high', surface: 'dirt', week: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, kind: 'breeze' })) }] });
  const exam = (resultStatus) => api('vet', 'POST', '/health/records', {
    horse: horse._id, diagnosis: `TEST ${resultStatus}`, resultStatus,
    ...(resultStatus === 'eligible' ? { clearedLevel: 'high' } : {}), vitalSigns: { temperatureC: 37.9, heartRate: 38 },
  }, 201);

  const route = `/feeding/calendar/${plan._id}`;
  const preview = await api('trainer', 'GET', route);
  const ahead = preview.days.filter((d) => d.date > dateKey(new Date()));
  const [dayA, dayB, untouched] = [ahead[1], ahead[2], ahead[3]];
  const asSent = (day) => day.meals.map((m) => ({ slot: m.slot, time: m.time, items: m.items.map((i) => ({ inventoryItem: i.inventoryItem, amount: i.amount })) }));
  const oatsIn = (meal) => meal.items.find((i) => String(i.inventoryItem) === String(oats._id))?.amount;
  const plannedOats = oatsIn(dayA.meals.find((m) => m.slot === 'evening'));
  await api('trainer', 'POST', `${route}/confirm`, {
    expectedUpdatedAt: preview.plan.updatedAt,
    days: [
      { date: dayA.date, meals: asSent(dayA).map((m) => (m.slot === 'evening' ? { ...m, items: m.items.map((i) => (String(i.inventoryItem) === String(oats._id) ? { ...i, amount: i.amount + 1 } : i)) } : m)) },
      { date: dayB.date, meals: asSent(dayB).filter((m) => m.slot !== 'noon') },
    ],
  });
  const day = (date) => models.FeedingCalendarDay.findOne({ horse: horse._id, date }).lean();
  const evening = (d) => d.meals.find((m) => m.slot === 'evening');

  // Injured: the sick diet on every day, the trainer's own days included, those kept aside.
  await exam('injured');
  const sickA = await day(dayA.date);
  assert.equal(sickA.diet, 'sick');
  assert.ok(oatsIn(evening(sickA)) < plannedOats, 'the sick diet, not the trainer\'s extra oats');
  assert.equal(evening(sickA).edited, false);
  assert.equal(oatsIn(sickA.healthy.meals.find((m) => m.slot === 'evening')), plannedOats + 1);
  const sickB = await day(dayB.date);
  assert.deepEqual(sickB.removedSlots, []);
  assert.deepEqual(sickB.healthy.removedSlots, ['noon']);

  // Under monitoring nothing moves; found fit, the trainer's changes are back and nothing stays kept aside.
  await exam('monitoring');
  assert.equal((await day(dayA.date)).diet, 'sick');
  await exam('eligible');
  const backA = await day(dayA.date);
  assert.equal(backA.diet, 'normal');
  assert.equal(oatsIn(evening(backA)), plannedOats + 1, 'the extra oats are back');
  assert.equal(evening(backA).edited, true);
  assert.equal(backA.healthy, null);
  const backB = await day(dayB.date);
  assert.deepEqual(backB.removedSlots, ['noon'], 'the meal left out stays left out');
  assert.ok(!backB.meals.some((m) => m.slot === 'noon'));
  assert.equal((await day(untouched.date)).diet, 'normal');
  assert.equal(evening(await day(untouched.date)).edited, false);

  // Ill again, the trainer starts over from the rules: nothing old comes back once fit.
  await exam('injured');
  assert.ok((await day(dayA.date)).healthy);
  const sickView = await api('trainer', 'GET', route);
  await api('trainer', 'POST', `${route}/confirm`, { expectedUpdatedAt: sickView.plan.updatedAt, fresh: true });
  assert.equal((await day(dayA.date)).healthy, null);
  await exam('eligible');
  const clean = await day(dayA.date);
  assert.equal(oatsIn(evening(clean)), plannedOats, 'the plan\'s meal, as the trainer asked');
  assert.equal(evening(clean).edited, false);
  assert.deepEqual((await day(dayB.date)).removedSlots, []);
});
