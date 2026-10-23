const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, day } = require('../../test-support/integration');

// Each stall has a groom (Stall.caretaker), empty or not: the groom's app lists it, a horse placed there
// gets them, and giving a stall or a whole zone another groom hands the horses and their open work over.
test('stall grooms: a stall keeps its groom, a horse placed there gets them, a stall changes hands with its horse', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('stallgroom');
  t.after(() => ctx.close());
  const { api, raw, users, models } = ctx;
  const other = await models.User.create({ name: 'TEST groom B', email: 'groom-b@integration.test', passwordHash: 'not-used', role: 'groom' });
  const locked = await models.User.create({ name: 'TEST groom locked', email: 'groom-locked@integration.test', passwordHash: 'not-used', role: 'groom', isActive: false });

  await api('manager', 'POST', '/stable/stalls/generate', { zone: 'A', count: 3, zoneName: 'Khu A' }, 201);
  const map = async (role = 'manager') => (await api(role, 'GET', '/stable/stalls')).stalls;
  const stallOf = async (code, role) => (await map(role)).find((s) => s.code === code);
  const a01 = await stallOf('A-01');
  const a02 = await stallOf('A-02');

  await t.test('an empty stall takes a groom, who sees it as theirs', async () => {
    const saved = await api('manager', 'PUT', `/stable/stalls/${a01._id}/caretaker`, { caretaker: users.groom.id });
    assert.equal(saved.code, 'A-01');
    assert.equal(saved.occupied, false);
    assert.equal(saved.caretaker.name, 'TEST groom');
    const seen = await stallOf('A-01', 'groom');
    assert.equal(String(seen.caretaker._id), users.groom.id, 'the groom finds the empty stall under their name');
    const notifications = await api('groom', 'GET', '/notifications');
    assert.ok(notifications.some((n) => /Bạn được giao chuồng A-01/.test(n.message)));
  });

  await t.test('only an active groom, sent as caretaker, and only by the Manager', async () => {
    assert.equal((await raw('manager', 'PUT', `/stable/stalls/${a01._id}/caretaker`, { caretaker: String(locked._id) })).status, 400);
    assert.equal((await raw('manager', 'PUT', `/stable/stalls/${a01._id}/caretaker`, { caretaker: users.trainer.id })).status, 400);
    assert.equal((await raw('manager', 'PUT', `/stable/stalls/${a01._id}/caretaker`, {})).status, 400);
    assert.equal((await raw('trainer', 'PUT', `/stable/stalls/${a01._id}/caretaker`, { caretaker: users.groom.id })).status, 403);
    assert.equal((await raw('manager', 'PUT', '/stable/zones/ZZ/caretaker', { caretaker: users.groom.id })).status, 404);
  });

  const horse = await api('manager', 'POST', '/horses', { name: 'TEST Groom Horse', owner: users.owner.id, assignedTrainer: users.trainer.id }, 201);

  await t.test('a horse placed in the stall gets the stall groom, and its feeds go to them', async () => {
    const placed = await api('manager', 'POST', '/stable/assignments', { horse: horse._id, stall: a01._id }, 201);
    assert.equal(String(placed.assignedCaretaker), users.groom.id);
    const feeds = await models.DailyTask.find({ horse: horse._id, taskType: 'feeding', status: 'pending' });
    assert.ok(feeds.length > 0, 'the horse has feeds from day one');
    assert.ok(feeds.every((f) => String(f.assignedTo) === users.groom.id));
  });

  await t.test('naming another groom when placing makes them the stall groom', async () => {
    await api('manager', 'POST', '/stable/assignments', { horse: horse._id, stall: a01._id, assignedCaretaker: String(other._id) }, 201);
    assert.equal(String((await stallOf('A-01')).caretaker._id), String(other._id));
  });

  await t.test('a stall with a horse changes hands: the horse and its open work go along', async () => {
    const before = await models.DailyTask.countDocuments({ horse: horse._id, status: 'pending', scheduledDate: { $gte: day(0) }, assignedTo: other._id });
    assert.ok(before > 0);
    const saved = await api('manager', 'PUT', `/stable/stalls/${a01._id}/caretaker`, { caretaker: users.groom.id });
    assert.equal(String(saved.caretaker._id), users.groom.id);
    assert.equal(String((await stallOf('A-02')).caretaker?._id || ''), '', 'the stall next door keeps its own (none)');
    const assignment = await models.StableAssignment.findOne({ horse: horse._id });
    assert.equal(String(assignment.assignedCaretaker), users.groom.id, 'the horse in A-01 goes with its stall');
    const stillWithOther = await models.DailyTask.countDocuments({ horse: horse._id, status: 'pending', scheduledDate: { $gte: day(0) }, assignedTo: other._id, taskType: 'feeding' });
    assert.equal(stillWithOther, 0, 'its unfinished feeds moved to the new groom');
    const told = await models.Notification.find({ recipientUser: other._id });
    assert.ok(told.some((n) => /đã chuyển sang người chăm sóc khác/.test(n.message)), 'the previous groom is told');
    // A groom is given stall by stall: there is no whole-zone assignment.
    assert.equal((await raw('manager', 'PUT', '/stable/zones/A/caretaker', { caretaker: users.groom.id })).status, 404);
  });

  await t.test('an owner sees the groom of their own horse, not of the empty stalls', async () => {
    const owners = await map('owner');
    assert.equal(owners.find((s) => s.code === 'A-01').caretaker.name, 'TEST groom');
    assert.equal(owners.find((s) => s.code === 'A-02').caretaker, null);
  });

  await t.test('a stall without its groom: the horse in it has none either', async () => {
    const cleared = await api('manager', 'PUT', `/stable/stalls/${a01._id}/caretaker`, { caretaker: null });
    assert.equal(cleared.caretaker, null);
    const assignment = await models.StableAssignment.findOne({ horse: horse._id });
    assert.equal(assignment.assignedCaretaker, null);
  });

  await t.test('a horse moved into a stall with a groom gets that groom', async () => {
    await api('manager', 'PUT', `/stable/stalls/${a02._id}/caretaker`, { caretaker: String(other._id) });
    await api('manager', 'POST', '/stable/assignments', { horse: horse._id, stall: a02._id }, 201);
    const assignment = await models.StableAssignment.findOne({ horse: horse._id });
    assert.equal(String(assignment.assignedCaretaker), String(other._id), 'the groom of A-02');
  });
});
