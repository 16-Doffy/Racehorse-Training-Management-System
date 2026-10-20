const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake } = require('../../test-support/integration');

// The stall catalogue and the stable map: the Manager lays out zones, horses go into stalls by id or by
// code, a stall under maintenance or taken can't be given, and each role sees the map with only its
// own horses named.
test('stall catalogue and stable map against real MongoDB', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('stalls');
  t.after(() => ctx.close());
  const { api, raw, users } = ctx;
  const { horse } = await intake(ctx, 'TEST Stall Horse');
  // A second horse with no owner and no trainer: on the map it is a taken stall without a name for them.
  const stranger = await api('manager', 'POST', '/horses', { name: 'TEST Stall Stranger', breed: 'Arabian' }, 201);
  const map = async (role = 'manager', query = '') => api(role, 'GET', `/stable/stalls${query}`);
  const stallOf = async (code, role = 'manager') => (await map(role)).stalls.find((s) => s.code === code);

  await t.test('the Manager lays out a zone in one go; a repeat only adds what is missing', async () => {
    const first = await api('manager', 'POST', '/stable/stalls/generate', { zone: 'a', count: 3, zoneName: 'Khu A', zonePurpose: 'Ngựa đua chủ lực' }, 201);
    assert.deepEqual(first.created.map((s) => s.code), ['A-01', 'A-02', 'A-03']);
    const again = await api('manager', 'POST', '/stable/stalls/generate', { zone: 'A', count: 4, zoneName: 'Khu A' }, 201);
    assert.deepEqual(again.created.map((s) => s.code), ['A-04']);
    assert.deepEqual(again.skipped.sort(), ['A-01', 'A-02', 'A-03']);
    const one = await api('manager', 'POST', '/stable/stalls', { zone: 'CL', number: 1, type: 'isolation', zoneName: 'Khu cách ly' }, 201);
    assert.equal(one.code, 'CL-01');
    assert.equal((await raw('manager', 'POST', '/stable/stalls', { zone: 'CL', code: 'CL-01' })).status, 409, 'a code is used once');
    assert.equal((await raw('manager', 'POST', '/stable/stalls', { zone: 'B', code: 'A-09' })).status, 400, 'the code starts with its zone');
    assert.equal((await raw('trainer', 'POST', '/stable/stalls/generate', { zone: 'B', count: 2 })).status, 403, 'only the Manager keeps the layout');

    const stalls = (await map()).stalls;
    assert.deepEqual(stalls.map((s) => s.code), ['A-01', 'A-02', 'A-03', 'A-04', 'CL-01']);
    assert.equal(stalls[0].zoneName, 'Khu A');
    assert.ok(stalls.every((s) => !s.occupied));
  });

  await t.test('a horse placed by stall id carries the code; a taken stall is refused', async () => {
    const before = await map();
    assert.ok(before.unplaced.some((u) => u.horse.name === 'TEST Stall Horse'), 'the free-text stall from intake waits to be placed');
    const a02 = before.stalls.find((s) => s.code === 'A-02');
    const saved = await api('manager', 'POST', '/stable/assignments', { horse: horse._id, stall: a02._id, assignedCaretaker: users.groom.id }, 201);
    assert.equal(saved.stableBlock, 'A-02', 'screens that show stableBlock keep working');
    assert.equal(String(saved.stall), String(a02._id));

    // Only the Manager places horses, even the trainer's own (stalls and grooms are the Manager's to allocate).
    assert.equal((await raw('trainer', 'POST', '/stable/assignments', { horse: horse._id, stall: a02._id })).status, 403);

    const taken = await raw('manager', 'POST', '/stable/assignments', { horse: stranger._id, stall: a02._id });
    assert.equal(taken.status, 409);
    assert.match(taken.body.message, /TEST Stall Horse/);

    // Text matching a stall's code is that stall (case does not matter).
    const byText = await api('manager', 'POST', '/stable/assignments', { horse: stranger._id, stableBlock: 'a-03' }, 201);
    assert.equal(byText.stableBlock, 'A-03');
    const after = await map();
    assert.equal(after.unplaced.length, 0, 'both horses are on the map now');
    assert.equal(after.stalls.find((s) => s.code === 'A-02').occupant.horse.name, 'TEST Stall Horse');
    assert.equal(after.stalls.find((s) => s.code === 'A-02').occupant.caretaker.name, 'TEST groom');
  });

  await t.test('maintenance: not while a horse is in it, and no horse goes into it', async () => {
    const a02 = await stallOf('A-02');
    assert.equal((await raw('manager', 'PATCH', `/stable/stalls/${a02._id}`, { status: 'maintenance' })).status, 409);
    const a04 = await stallOf('A-04');
    const closed = await api('manager', 'PATCH', `/stable/stalls/${a04._id}`, { status: 'maintenance', maintenanceNote: 'Thay vách gỗ' });
    assert.equal(closed.status, 'maintenance');
    const refused = await raw('manager', 'POST', '/stable/assignments', { horse: horse._id, stall: a04._id });
    assert.equal(refused.status, 409);
    assert.match(refused.body.message, /bảo trì/);
    const reopened = await api('manager', 'PATCH', `/stable/stalls/${a04._id}`, { status: 'active' });
    assert.equal(reopened.maintenanceNote, '', 'reopening clears the note');
    assert.equal((await raw('manager', 'PATCH', `/stable/stalls/${a04._id}`, { type: 'garage' })).status, 400);
  });

  await t.test('each role sees every stall, but names only its own horses', async () => {
    for (const role of ['owner', 'trainer']) {
      // eslint-disable-next-line no-await-in-loop
      const stalls = (await map(role)).stalls;
      const mine = stalls.find((s) => s.code === 'A-02');
      const theirs = stalls.find((s) => s.code === 'A-03');
      assert.equal(mine.occupant.horse.name, 'TEST Stall Horse', `${role} sees their horse`);
      assert.equal(theirs.occupied, true, `${role} sees that A-03 is taken`);
      assert.deepEqual(theirs.occupant, { hidden: true }, `${role} does not see whose horse it is`);
    }
    const mine = await api('owner', 'GET', `/stable/stalls/by-horse/${horse._id}`);
    assert.equal(mine.stall.code, 'A-02');
    assert.equal(mine.caretaker.name, 'TEST groom');
    assert.equal((await raw('owner', 'GET', `/stable/stalls/by-horse/${stranger._id}`)).status, 403);
  });

  await t.test('only an empty stall is taken out of use, and it leaves the map', async () => {
    const a02 = await stallOf('A-02');
    assert.equal((await raw('manager', 'DELETE', `/stable/stalls/${a02._id}`)).status, 409);
    const a01 = await stallOf('A-01');
    await api('manager', 'DELETE', `/stable/stalls/${a01._id}`);
    assert.ok(!(await map()).stalls.some((s) => s.code === 'A-01'));
    assert.ok((await map('manager', '?all=true')).stalls.some((s) => s.code === 'A-01' && !s.isActive));
    const retired = await raw('manager', 'POST', '/stable/assignments', { horse: horse._id, stall: a01._id });
    assert.equal(retired.status, 409);
  });
});
