const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, planFor } = require('../../test-support/integration');

// An active plan works like a timetable: this week and next are booked without anyone generating
// them, a session the trainer called off stays off, and running it again books nothing twice.
test('plan timetable: this week and next booked ahead', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('timetable');
  t.after(() => {
    process.env.AUTO_SCHEDULE_PLANS = 'false';
    return ctx.close();
  });
  process.env.AUTO_SCHEDULE_PLANS = 'true';
  const { models, api, users } = ctx;
  const { scheduleActivePlans, mondayOf, DAY_MS } = require('../../src/modules/training/trainingPlan.service');
  const { horse, record } = await intake(ctx, 'TEST Timetable Horse');
  const week = [1, 2, 3, 4, 5, 6].map((day) => ({ day, kind: 'walk' }));
  const plan = await planFor(ctx, horse, { phases: [{ key: 'base_building', weeks: 4, distanceTarget: 1600, weeklyVolumeKm: 20, intensity: 'moderate', surface: 'dirt', week }] });

  const nextWeek = new Date(mondayOf(new Date()).getTime() + 7 * DAY_MS);
  const inNextWeek = { trainingPlan: plan._id, scheduledAt: { $gte: nextWeek, $lt: new Date(nextWeek.getTime() + 7 * DAY_MS) } };
  await t.test('putting the plan into use books next week at once, and nothing already past', async () => {
    assert.equal(await models.TrainingSession.countDocuments(inNextWeek), 6);
    assert.equal(await models.TrainingSession.countDocuments({ trainingPlan: plan._id, scheduledAt: { $lt: new Date() } }), 0);
  });

  await t.test('the hourly run books nothing twice, and leaves a called-off session off', async () => {
    const total = await models.TrainingSession.countDocuments({ trainingPlan: plan._id });
    const one = await models.TrainingSession.findOne(inNextWeek);
    await models.TrainingSession.updateOne({ _id: one._id }, { status: 'cancelled' });
    await scheduleActivePlans();
    await scheduleActivePlans();
    assert.equal(await models.TrainingSession.countDocuments({ trainingPlan: plan._id }), total);
    assert.equal(await models.TrainingSession.countDocuments({ ...inNextWeek, status: { $ne: 'cancelled' } }), 5);
  });

  await t.test('a horse the vet locked gets nothing booked, and the run carries on', async () => {
    await models.TrainingSession.deleteMany({ trainingPlan: plan._id });
    await models.Horse.updateOne({ _id: horse._id }, { healthStatus: 'injured' });
    await scheduleActivePlans();
    assert.equal(await models.TrainingSession.countDocuments({ trainingPlan: plan._id }), 0);
  });

  await t.test('a lock cancels the bookings; the vet’s return books the plan again, but not what the trainer called off', async () => {
    await models.Horse.updateOne({ _id: horse._id }, { healthStatus: 'eligible' });
    // Confirmed for a race well after the plan's two booked weeks.
    const entry = await models.RaceEntry.create({ horse: horse._id, registeredBy: users.trainer.id, raceName: 'TEST Timetable Cup', raceDate: new Date(Date.now() + 60 * DAY_MS), distance: 1600, status: 'confirmed' });
    await models.TrainingPlan.updateOne({ _id: plan._id }, { targetRace: entry._id });
    const formNow = async () => (await api('trainer', 'GET', '/training/plans')).find((p) => p._id === String(plan._id)).progress.form;
    await scheduleActivePlans();
    assert.equal(await models.TrainingSession.countDocuments({ ...inNextWeek, status: 'scheduled' }), 6);
    const dropped = await models.TrainingSession.findOne(inNextWeek).sort({ scheduledAt: 1 });
    await api('trainer', 'PUT', `/training/sessions/${dropped._id}`, { status: 'cancelled', cancelReason: 'TEST HLV đổi lịch' });
    assert.equal((await models.TrainingSession.findById(dropped._id)).cancelSource, 'trainer');

    const lock = await api('vet', 'POST', '/health/treatments', { horse: horse._id, healthRecord: record._id, trainingLevel: 'none', lockReason: 'TEST viêm gân' }, 201);
    assert.equal(await models.TrainingSession.countDocuments({ ...inNextWeek, status: 'scheduled' }), 0, 'the lock cancels them all');
    assert.equal(await models.TrainingSession.countDocuments({ ...inNextWeek, cancelSource: 'medical' }), 5);
    assert.equal((await formNow()).status, 'blocked', 'not fit for the race while locked');
    assert.equal((await models.RaceEntry.findById(entry._id)).reviewNeeded, true, 'the confirmed entry is marked for review');
    await scheduleActivePlans();
    assert.equal(await models.TrainingSession.countDocuments({ ...inNextWeek, status: 'scheduled' }), 0, 'nothing while locked');

    await api('vet', 'PUT', `/health/treatments/${lock._id}`, { status: 'completed' });
    await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST hết sưng, tập lại bình thường', resultStatus: 'eligible', clearedLevel: 'high' }, 201);
    assert.equal(await models.TrainingSession.countDocuments({ ...inNextWeek, status: 'scheduled' }), 5, 'booked again, the trainer’s cancellation stays off');
    assert.ok(await models.Notification.exists({ type: 'training_unlocked', message: /Đã xếp lại \d+ buổi tập/ }));
    assert.notEqual((await formNow()).status, 'blocked', 'cleared: judged on its training again');
    assert.equal((await models.RaceEntry.findById(entry._id)).reviewNeeded, true, 'the trainer still decides again');
  });
});
