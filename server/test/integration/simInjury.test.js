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

  await t.test('a normal reading, then the injury: one lame reading, and the next stops the run as a suspected injury', async () => {
    await simulateTick();
    assert.equal((await models.TrainingSession.findById(session._id)).status, 'in_progress');
    const normalSpeed = (await models.TrainingSession.findById(session._id)).metrics.lastSpeed;
    assert.equal((await raw('trainer', 'POST', `/training/sessions/${session._id}/simulate`, { scenario: 'injury', leg: 'tail' })).status, 400);
    await api('trainer', 'POST', `/training/sessions/${session._id}/simulate`, { scenario: 'injury', leg: 'hind_left' });
    await simulateTick();
    const lame = await models.TrainingSession.findById(session._id);
    assert.equal(lame.status, 'in_progress', 'one bad reading does not stop the run');
    assert.ok(lame.metrics.lastSpeed < normalSpeed * 0.6, 'the horse goes lame: its speed falls away');
    await simulateTick();

    const stopped = await models.TrainingSession.findById(session._id);
    assert.equal(stopped.status, 'aborted');
    assert.equal(stopped.abortCategory, 'injury');
    assert.match(stopped.abortReason, /Cảm biến: tốc độ tụt còn .*nghi đau chân sau trái — hệ thống tự dừng/);
    assert.equal(stopped.endedBy, null, 'stopped by the sensor feed, not a person');

    const exam = await models.ExamRequest.findOne({ horse: horse._id, status: 'pending' });
    assert.equal(exam?.priority, 'high');
    assert.deepEqual(exam.bodyAreas, ['hind_left'], 'the vet sees which leg');
    const care = await models.DailyTask.findOne({ trainingSession: session._id, taskType: 'icing' });
    assert.equal(String(care?.assignedTo), String(users.groom.id));
    assert.match(care.note, /chườm lạnh chân sau trái/);
    assert.ok(await models.Notification.exists({ recipientUser: users.trainer.id, type: 'fitness_alert', message: /nghi chấn thương/ }));
    assert.ok(await models.Notification.exists({ recipientUser: users.groom.id, message: /chườm lạnh chân sau trái ngay/ }));
    assert.ok(await models.Notification.exists({ recipientUser: users.owner.id, message: /Nghi chấn thương/ }));
    assert.ok(await models.Notification.exists({ recipientUser: users.vet.id, type: 'exam_request' }));

    // The run can be played back: every reading kept, the normal one, the lame one and the last.
    const replay = await api('trainer', 'GET', `/training/sessions/${session._id}/readings`);
    assert.equal(replay.length, 3);
    assert.ok(replay[1].speed < replay[0].speed * 0.6, 'the lame reading');
    assert.ok(replay.every((r) => r.hr > 0 && r.at));
    assert.deepEqual(replay.map((r) => r.scenario ?? null), [null, 'injury', 'injury'], 'the replay lames the horse from the right reading');
    const listed = (await api('trainer', 'GET', '/training/sessions')).find((s) => s._id === String(session._id));
    assert.equal(listed.trace, undefined, 'the list does not carry the readings');
  });

  await t.test('a run that has ended takes no scenario, and a second tick changes nothing', async () => {
    assert.equal((await simulate('trainer', 'tired')).status, 409);
    await simulateTick();
    assert.equal(await models.DailyTask.countDocuments({ trainingSession: session._id, taskType: 'icing' }), 1);
  });
});
