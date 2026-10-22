const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, planFor, book, start } = require('../../test-support/integration');

// On the simulated sensors a trainer can make a running horse go lame: the feed stops the run
// itself, the vet gets an urgent exam request, the groom the first aid, the trainer and the owner
// a message — the same as a real injury stop, without anyone pressing "Dừng".
test('simulated sensors: a horse that goes lame mid-run is stopped and everyone concerned is told', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('siminjury');
  t.after(() => {
    process.env.ENABLE_SENSOR_SIMULATOR = 'false';
    return ctx.close();
  });
  const { api, raw, users, models } = ctx;
  const { simulateTick } = require('../../src/realtime/sensorSimulator');
  const { horse } = await intake(ctx, 'TEST Lame Horse');
  const plan = await planFor(ctx, horse);
  const session = await book(ctx, horse, plan);
  await start(ctx, session);
  const simulate = (role, scenario) => raw(role, 'POST', `/training/sessions/${session._id}/simulate`, { scenario });

  await t.test('only on simulated sensors, only a known scenario, only the trainer', async () => {
    assert.equal((await simulate('trainer', 'injury')).status, 409);
    process.env.ENABLE_SENSOR_SIMULATOR = 'true';
    assert.equal((await simulate('trainer', 'broken-leg')).status, 400);
    assert.equal((await simulate('owner', 'injury')).status, 403);
  });

  await t.test('a normal reading, then the injury: the run is stopped as a suspected injury', async () => {
    await simulateTick();
    assert.equal((await models.TrainingSession.findById(session._id)).status, 'in_progress');
    await api('trainer', 'POST', `/training/sessions/${session._id}/simulate`, { scenario: 'injury' });
    await simulateTick();

    const stopped = await models.TrainingSession.findById(session._id);
    assert.equal(stopped.status, 'aborted');
    assert.equal(stopped.abortCategory, 'injury');
    assert.match(stopped.abortReason, /Cảm biến: tốc độ tụt còn .* hệ thống tự dừng/);
    assert.equal(stopped.endedBy, null, 'stopped by the sensor feed, not a person');

    const exam = await models.ExamRequest.findOne({ horse: horse._id, status: 'pending' });
    assert.equal(exam?.priority, 'high');
    const care = await models.DailyTask.findOne({ trainingSession: session._id, taskType: 'icing' });
    assert.equal(String(care?.assignedTo), String(users.groom.id));
    assert.match(care.note, /chườm lạnh/);
    assert.ok(await models.Notification.exists({ recipientUser: users.trainer.id, type: 'fitness_alert', message: /nghi chấn thương/ }));
    assert.ok(await models.Notification.exists({ recipientUser: users.groom.id, message: /chườm lạnh chân ngay/ }));
    assert.ok(await models.Notification.exists({ recipientUser: users.owner.id, message: /Nghi chấn thương/ }));
    assert.ok(await models.Notification.exists({ recipientUser: users.vet.id, type: 'exam_request' }));
  });

  await t.test('a run that has ended takes no scenario, and a second tick changes nothing', async () => {
    assert.equal((await simulate('trainer', 'tired')).status, 409);
    await simulateTick();
    assert.equal(await models.DailyTask.countDocuments({ trainingSession: session._id, taskType: 'icing' }), 1);
  });
});
