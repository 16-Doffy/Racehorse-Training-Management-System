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
  const { models } = ctx;
  const { scheduleActivePlans, mondayOf, DAY_MS } = require('../../src/modules/training/trainingPlan.service');
  const { horse } = await intake(ctx, 'TEST Timetable Horse');
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
});
