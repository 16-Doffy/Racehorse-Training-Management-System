const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, planFor } = require('../../test-support/integration');

// A day of the week template is a workout in parts (warm-up → work → cool-down), booked as it is; the
// trainer changes one booked session's work for that day only; the day's confirmed meals follow it.
test('workout in parts: the week template, one session changed, and the meals of its day', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('workoutparts');
  t.after(() => {
    process.env.AUTO_SCHEDULE_PLANS = 'false';
    return ctx.close();
  });
  const { api, raw, models } = ctx;
  const { horse } = await intake(ctx, 'TEST Parts Horse');
  await models.Horse.updateOne({ _id: horse._id }, { $set: { weightKg: 500 } });
  const stock = async (name, feedType, quantity) => api('manager', 'POST', '/inventory', { name, category: 'feed', unit: 'kg', quantity, feedType }, 201);
  await stock('TEST parts Timothy hay', 'forage', 900);
  const alfalfa = await stock('TEST parts Alfalfa hay', 'forage', 500);
  await stock('TEST parts oats', 'concentrate', 900);
  const barley = await stock('TEST parts barley', 'concentrate', 300);
  const pellets = await stock('TEST parts pellets', 'concentrate', 300);

  const hillDay = [
    { kind: 'walk', durationMinutes: 10, targetSpeedKmh: 7, note: 'Đi bộ khởi động' },
    { kind: 'hill', durationMinutes: 20, distanceM: 2400, targetSpeedKmh: 30, restMinutes: 3, note: '6 hiệp dốc' },
    { kind: 'walk', durationMinutes: 15, targetSpeedKmh: 6 },
  ];
  const phase = (week) => ({ phases: [{ key: 'strength', weeks: 2, distanceTarget: 1600, weeklyVolumeKm: 20, intensity: 'high', surface: 'dirt', week }] });
  const create = (week) => raw('trainer', 'POST', '/training/plans', {
    horse: horse._id, distanceTarget: 1600, surface: 'dirt', startDate: new Date().toISOString(), status: 'active', goal: 'TEST parts', ...phase(week),
  });

  await t.test('the template refuses parts that break its rules', async () => {
    // (Hill work in the afternoon is refused too, under the club's AFTERNOON_LIGHT_ONLY, which the harness turns off.)
    assert.equal((await create([{ day: 2, kind: 'walk', segments: [{ kind: 'trial', distanceM: 1600 }] }])).status, 400, 'a trial in the template');
    assert.equal((await create([{ day: 2, kind: 'walk', segments: [{ kind: 'walk', note: 'no numbers' }] }])).status, 400, 'a part without minutes or metres');
    assert.equal((await create([{ day: 2, kind: 'walk', segments: [{ kind: 'walk', durationMinutes: 10, targetSpeedKmh: 40 }] }])).status, 400, 'a walk at 40 km/h');
    assert.equal(await models.TrainingPlan.countDocuments({ horse: horse._id }), 0);
  });

  process.env.AUTO_SCHEDULE_PLANS = 'true';
  const plan = await planFor(ctx, horse, phase([0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, kind: 'walk', segments: hillDay }))));

  await t.test('a day in parts is as hard as its hardest part, and is booked in its parts', async () => {
    const saved = await models.TrainingPlan.findById(plan._id).lean();
    assert.equal(saved.phases[0].week[0].kind, 'hill');
    assert.equal(saved.phases[0].week[0].segments.length, 3);
    const booked = await models.TrainingSession.find({ trainingPlan: plan._id, status: 'scheduled' }).lean();
    assert.ok(booked.length >= 7, 'this week and next');
    for (const s of booked) {
      assert.equal(s.kind, 'hill');
      assert.deepEqual(s.segments.map((x) => x.kind), ['walk', 'hill', 'walk']);
      assert.equal(s.prescription.durationMinutes, 45);
      assert.equal(s.prescription.distanceM, 2400);
      assert.equal(s.prescription.reps, 1);
    }
  });

  // The meals are confirmed; a hill day mixes alfalfa (protein) and pellets into the main hay and oats.
  const route = `/feeding/calendar/${plan._id}`;
  const preview = await api('trainer', 'GET', route);
  await api('trainer', 'POST', `${route}/confirm`, { expectedUpdatedAt: preview.plan.updatedAt });
  const twoDaysOn = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  twoDaysOn.setHours(0, 0, 0, 0);
  const session = await models.TrainingSession.findOne({ trainingPlan: plan._id, status: 'scheduled', scheduledAt: { $gte: twoDaysOn } }).sort({ scheduledAt: 1 });
  const at = new Date(session.scheduledAt);
  const dateKey = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  const dayItems = async () => {
    const d = await models.FeedingCalendarDay.findOne({ horse: horse._id, date: dateKey }).lean();
    return new Set(d.meals.flatMap((m) => m.items.map((i) => String(i.inventoryItem))));
  };
  const before = await dayItems();
  assert.ok(before.has(String(alfalfa._id)) && before.has(String(pellets._id)), 'a hill day: alfalfa and pellets mixed in');
  assert.ok(!before.has(String(barley._id)));
  const dayView = preview.days.find((d) => d.date === dateKey);
  assert.match(dayView.rationNote, /leo dốc/i, 'the trainer reads why');

  await t.test('the trainer changes that one session: its parts, its kind, the groom told, the day re-fed', async () => {
    const breezeDay = [
      { kind: 'walk', durationMinutes: 10, targetSpeedKmh: 7, note: 'Đi bộ khởi động' },
      { kind: 'canter', durationMinutes: 4, distanceM: 1600, targetSpeedKmh: 32 },
      { kind: 'breeze', durationMinutes: 1, distanceM: 800, targetSpeedKmh: 58, targetHeartRateMax: 215 },
      { kind: 'walk', durationMinutes: 15, targetSpeedKmh: 6 },
    ];
    const changed = await api('trainer', 'PUT', `/training/sessions/${session._id}`, {
      kind: 'walk', // a lighter label than its hardest part: the server takes the part's
      segments: breezeDay,
      prescription: { reps: 1, targetSpeedKmh: 58, targetHeartRateMax: 215 },
      coachNote: 'TEST sân dốc ướt, đổi sang phi nhanh trên đường đua',
    });
    assert.equal(changed.kind, 'breeze');
    assert.equal(changed.intensity, 'high');
    assert.equal(changed.segments.length, 4);
    assert.equal(changed.prescription.durationMinutes, 30);
    assert.equal(changed.prescription.distanceM, 2400);
    assert.equal(new Date(changed.endAt).getTime(), at.getTime() + 30 * 60000, 'the planned end follows the new work');
    const told = await models.Notification.findOne({ horse: horse._id, type: 'session_scheduled', message: /HLV đổi từ "Tập dốc" sang "Phi nhanh"/ });
    assert.ok(told, 'the groom hears of the new work');

    const after = await dayItems();
    assert.ok(after.has(String(barley._id)), 'a speed day: an energy grain mixed in');
    const fed = await models.Notification.findOne({ horse: horse._id, type: 'task_assigned', message: /đổi theo buổi tập mới/ });
    assert.ok(fed, 'the groom hears the meals of that day changed');
    const otherDay = await models.FeedingCalendarDay.findOne({ horse: horse._id, plan: plan._id, date: { $ne: dateKey, $gt: dateKey } }).lean();
    assert.ok(!otherDay.meals.some((m) => m.items.some((i) => String(i.inventoryItem) === String(barley._id))), 'the other days keep their meals');

    // Back to one workout without parts: the kind's own.
    const single = await api('trainer', 'PUT', `/training/sessions/${session._id}`, { kind: 'canter', segments: [] });
    assert.equal(single.kind, 'canter');
    assert.equal(single.segments.length, 0);
  });

  await t.test('the meals move around the sessions: digested before, cooled down after', async () => {
    const { horse: early } = await intake(ctx, 'TEST Parts Early Horse');
    await models.Horse.updateOne({ _id: early._id }, { $set: { weightKg: 480 } });
    const afternoon = [
      { kind: 'walk', durationMinutes: 20, targetSpeedKmh: 5, note: 'Dắt bộ giãn cơ' },
      { kind: 'walk', durationMinutes: 20, targetSpeedKmh: 5, note: 'Máy đi bộ' },
    ];
    const week = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
      { day, kind: 'walk', segments: hillDay },
      { day, slot: 'afternoon', kind: 'walk', segments: afternoon },
    ]);
    const earlyPlan = await planFor(ctx, early, { sessionTime: '07:00', afternoonTime: '17:00', ...phase(week) });
    const view = await api('trainer', 'GET', `/feeding/calendar/${earlyPlan._id}`);
    const day = view.days.filter((d) => !d.past).at(-1);
    const at = (slot) => day.meals.find((m) => m.slot === slot).time;
    assert.equal(at('morning'), '05:30', 'breakfast 90 minutes before 07:00');
    assert.equal(at('evening'), '18:15', 'supper after the 17:00–17:40 walk has cooled the horse down');
    assert.match(day.rationNote, /Giờ ăn theo giờ tập/);
    assert.deepEqual(day.sessions.map((x) => `${x.at}–${x.until}`), ['07:00–07:45', '17:00–17:40']);
  });

  await t.test('new week templates rebook the sessions ahead, but not the one the trainer changed', async () => {
    const mine = await models.TrainingSession.findById(session._id).lean();
    assert.equal(mine.generated, false, 'changed by the trainer: no longer the plan\'s own');
    const canterDay = [
      { kind: 'walk', durationMinutes: 15, targetSpeedKmh: 6, note: 'Đi bộ khởi động' },
      { kind: 'canter', durationMinutes: 5, distanceM: 2400, targetSpeedKmh: 32 },
      { kind: 'walk', durationMinutes: 20, targetSpeedKmh: 6, note: 'Đi bộ thả lỏng' },
    ];
    await api('trainer', 'PUT', `/training/plans/${plan._id}`, phase([0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, kind: 'canter', segments: canterDay }))));
    const ahead = await models.TrainingSession.find({ trainingPlan: plan._id, generated: true, status: 'scheduled', scheduledAt: { $gt: new Date() } }).lean();
    assert.ok(ahead.length >= 1, 'the weeks ahead booked again');
    for (const s of ahead) {
      assert.equal(s.kind, 'canter');
      assert.deepEqual(s.segments.map((x) => x.kind), ['walk', 'canter', 'walk']);
    }
    const still = await models.TrainingSession.findById(session._id).lean();
    assert.ok(still, 'the trainer\'s own session is kept');
    assert.equal(still.kind, mine.kind);
    const sameSlot = await models.TrainingSession.countDocuments({ horse: horse._id, scheduledAt: still.scheduledAt, status: { $ne: 'cancelled' } });
    assert.equal(sameSlot, 1, 'nothing booked twice on its slot');
  });

  await t.test('harder work than the vet allows is refused', async () => {
    await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST căng cơ nhẹ', resultStatus: 'eligible', clearedLevel: 'light', vitalSigns: { temperatureC: 37.8, heartRate: 38 } }, 201);
    const walk = await models.TrainingSession.findOne({ trainingPlan: plan._id, status: 'scheduled', scheduledAt: { $gt: new Date() } });
    assert.ok(walk, 'a booking still open');
    const refused = await raw('trainer', 'PUT', `/training/sessions/${walk._id}`, { kind: 'breeze', segments: [{ kind: 'walk', durationMinutes: 10, targetSpeedKmh: 7 }, { kind: 'breeze', distanceM: 800, durationMinutes: 1, targetSpeedKmh: 58 }] });
    assert.equal(refused.status, 409);
    assert.match(refused.body.message, /Bác sĩ/);
    const light = await api('trainer', 'PUT', `/training/sessions/${walk._id}`, { kind: 'walk', segments: [{ kind: 'walk', durationMinutes: 30, targetSpeedKmh: 7 }] });
    assert.equal(light.kind, 'walk');
  });
});
