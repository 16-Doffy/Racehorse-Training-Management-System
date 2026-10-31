const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake } = require('../../test-support/integration');

test('care routines: a job for many days becomes each day\'s tasks, follows its changes and stops', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('careroutines');
  t.after(() => ctx.close());
  const { api, raw, models, users } = ctx;
  const { horse } = await intake(ctx, 'TEST Routine Horse');
  const pad = (n) => String(n).padStart(2, '0');
  const later = (minutes) => {
    const d = new Date(Date.now() + minutes * 60000);
    // Still today: a time late in the day keeps the test meaningful near midnight.
    if (d.getDate() !== new Date().getDate()) return '23:59';
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const today = new Date();
  const inDays = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n).toISOString();
  const [first, second] = [later(30), later(90)].sort();
  const body = {
    horse: horse._id, taskType: 'icing', times: first === second ? [first] : [first, second], durationMinutes: 20,
    instructions: 'Ngâm hai chân trước trong nước đá 20 phút, lau khô, so độ sưng hai bên.', startDate: inDays(0), endDate: inDays(13),
  };

  const bad = (extra) => raw('trainer', 'POST', '/stable/routines', { ...body, ...extra });
  assert.equal((await bad({ taskType: 'medication' })).status, 400, 'the vet\'s orders are not handed out here');
  assert.equal((await bad({ times: [] })).status, 400, 'at least one time a day');
  assert.equal((await bad({ times: ['07:00', '07:00'] })).status, 400, 'two times the same');
  assert.equal((await bad({ durationMinutes: 0 })).status, 400);
  assert.equal((await bad({ instructions: '  ' })).status, 400, 'how to do it is required');
  assert.equal((await bad({ startDate: inDays(-2) })).status, 400, 'not from a day gone');
  assert.equal((await bad({ endDate: inDays(-1), startDate: inDays(0) })).status, 400);
  assert.equal((await bad({ taskType: 'other', title: '' })).status, 400, 'an "other" job needs its name');
  assert.equal((await bad({ weekDays: [] })).status, 400);
  assert.equal((await raw('groom', 'POST', '/stable/routines', body)).status, 403);

  const routine = await api('trainer', 'POST', '/stable/routines', body, 201);
  assert.equal(routine.occurrences, 14 * body.times.length);
  const todays = () => models.DailyTask.find({ routine: routine._id }).sort({ scheduledDate: 1 }).lean();
  let tasks = await todays();
  assert.equal(tasks.length, body.times.length, 'one task per time today');
  assert.equal(String(tasks[0].assignedTo), String(users.groom.id), 'the stall\'s groom does it');
  assert.equal(tasks[0].durationMinutes, 20);
  assert.match(tasks[0].note, /Mỗi lần 20 phút\. Ngâm hai chân trước/);
  assert.ok(await models.Notification.exists({ recipientUser: users.groom.id, type: 'task_assigned', message: /việc dài hạn/ }));

  // Run again (the hourly generator): nothing doubles.
  const { syncAllRoutineTasks } = require('../../src/modules/stable/careRoutine.service');
  await syncAllRoutineTasks();
  assert.equal((await todays()).length, body.times.length);

  // One day of it can be called off, not edited or deleted on its own.
  assert.equal((await raw('trainer', 'PUT', `/stable/tasks/${tasks[0]._id}`, { note: 'khác' })).status, 409);
  assert.equal((await raw('trainer', 'DELETE', `/stable/tasks/${tasks[0]._id}`)).status, 409);
  await api('trainer', 'PUT', `/stable/tasks/${tasks[0]._id}`, { status: 'skipped' });
  await syncAllRoutineTasks();
  assert.equal((await models.DailyTask.find({ routine: routine._id, status: 'skipped' })).length, 1, 'a skipped time is not made again');

  // The routine changes: today's open tasks follow it.
  const updated = await api('trainer', 'PUT', `/stable/routines/${routine._id}`, { ...body, times: [second === first ? later(120) : second], durationMinutes: 30, startDate: routine.startDate });
  assert.equal(updated.durationMinutes, 30);
  tasks = await models.DailyTask.find({ routine: routine._id, status: 'pending' }).lean();
  assert.equal(tasks.length, 1);
  assert.match(tasks[0].note, /Mỗi lần 30 phút/);

  // Listed for the trainer, with its horse and groom; the groom sees the routines in use.
  const list = await api('trainer', 'GET', `/stable/routines?horse=${horse._id}`);
  assert.equal(list.length, 1);
  assert.equal(list[0].horse.name, 'TEST Routine Horse');
  assert.equal((await api('outsider', 'GET', '/stable/routines')).length, 0, 'not seen by the owner of other horses');

  // Stopped: today's open task goes, the skipped one stays on record, and it can no longer change.
  await api('trainer', 'POST', `/stable/routines/${routine._id}/stop`);
  assert.equal(await models.DailyTask.countDocuments({ routine: routine._id, status: 'pending' }), 0);
  assert.equal(await models.DailyTask.countDocuments({ routine: routine._id, status: 'skipped' }), 1);
  assert.equal((await raw('trainer', 'PUT', `/stable/routines/${routine._id}`, body)).status, 409);
  await syncAllRoutineTasks();
  assert.equal(await models.DailyTask.countDocuments({ routine: routine._id, status: 'pending' }), 0, 'a stopped job is not made again');

  // A routine for later days makes nothing today; one for weekdays other than today neither.
  const tomorrow = await api('trainer', 'POST', '/stable/routines', { ...body, startDate: inDays(1), endDate: inDays(3) }, 201);
  assert.equal(await models.DailyTask.countDocuments({ routine: tomorrow._id }), 0);
  const otherDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== today.getDay());
  const notToday = await api('trainer', 'POST', '/stable/routines', { ...body, weekDays: otherDays }, 201);
  assert.equal(await models.DailyTask.countDocuments({ routine: notToday._id }), 0);
});
