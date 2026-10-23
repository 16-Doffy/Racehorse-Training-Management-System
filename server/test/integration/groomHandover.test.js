const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { startIntegration, intake } = require('../../test-support/integration');

// Locking a groom (or moving them to another role) who still holds stalls, horses or work needs a
// replacement, named in the same save: everything goes over to them at once, so no horse is left with
// a caretaker who can no longer log in.
test('a groom leaving hands their stalls, horses and work to a replacement', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('groomhandover');
  t.after(() => ctx.close());
  const { api, raw, users, models } = ctx;

  const { created } = await api('manager', 'POST', '/stable/stalls/generate', { zone: 'H', count: 2 }, 201);
  const { horse } = await intake(ctx, 'TEST handover horse');
  await api('manager', 'POST', '/stable/assignments', { horse: horse._id, stall: created[0]._id, assignedCaretaker: users.groom.id }, 201);
  const task = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'icing', source: 'system', scheduledDate: new Date(), trainingSession: new mongoose.Types.ObjectId() });
  const newGroom = async (name) => models.User.create({ name, email: `${name.replace(/\s+/g, '-').toLowerCase()}@integration.test`, passwordHash: 'not-used', role: 'groom' });

  await t.test('without a replacement the lock is refused and says what the groom holds', async () => {
    const refused = await raw('manager', 'PUT', `/users/${users.groom.id}`, { isActive: false });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.data.needsReplacement, true);
    assert.deepEqual(refused.body.data.stalls, ['H-01']);
    assert.ok(refused.body.data.horses.includes('TEST handover horse'));
    assert.ok(refused.body.data.pendingTasks >= 1);
    assert.equal((await models.User.findById(users.groom.id)).isActive, true, 'nothing changed');
    // Moving them to another role is the same.
    assert.equal((await raw('manager', 'PUT', `/users/${users.groom.id}`, { role: 'owner' })).status, 409);
  });

  await t.test('the replacement must be another active groom', async () => {
    assert.equal((await raw('manager', 'PUT', `/users/${users.groom.id}`, { isActive: false, replacementCaretaker: users.groom.id })).status, 400);
    assert.equal((await raw('manager', 'PUT', `/users/${users.groom.id}`, { isActive: false, replacementCaretaker: users.trainer.id })).status, 400);
    const locked = await newGroom('TEST locked groom');
    await models.User.updateOne({ _id: locked._id }, { isActive: false });
    assert.equal((await raw('manager', 'PUT', `/users/${users.groom.id}`, { isActive: false, replacementCaretaker: locked.id })).status, 400);
  });

  await t.test('with a replacement the stall, the horse and the work go over in the same save', async () => {
    const replacement = await newGroom('TEST replacement groom');
    const saved = await raw('manager', 'PUT', `/users/${users.groom.id}`, { isActive: false, replacementCaretaker: replacement.id });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.match(saved.body.message, /Đã chuyển 1 chuồng, 1 ngựa/);
    assert.equal((await models.User.findById(users.groom.id)).isActive, false);
    assert.equal(String((await models.Stall.findById(created[0]._id)).caretaker), replacement.id);
    assert.equal(String((await models.StableAssignment.findOne({ horse: horse._id })).assignedCaretaker), replacement.id);
    assert.equal(String((await models.DailyTask.findById(task._id)).assignedTo), replacement.id);
    assert.ok(await models.Notification.exists({ recipientUser: replacement._id, type: 'task_assigned' }), 'the new groom is told');
  });

  await t.test('locking through DELETE follows the same rule; a groom holding nothing is locked at once', async () => {
    const holder = await models.User.findOne({ name: 'TEST replacement groom' });
    assert.equal((await raw('manager', 'DELETE', `/users/${holder.id}`)).status, 409);
    const next = await newGroom('TEST next groom');
    await api('manager', 'DELETE', `/users/${holder.id}`, { replacementCaretaker: next.id });
    assert.equal(String((await models.StableAssignment.findOne({ horse: horse._id })).assignedCaretaker), next.id);

    const idle = await newGroom('TEST idle groom');
    await api('manager', 'PUT', `/users/${idle.id}`, { isActive: false });
    assert.equal((await models.User.findById(idle._id)).isActive, false);
  });
});
