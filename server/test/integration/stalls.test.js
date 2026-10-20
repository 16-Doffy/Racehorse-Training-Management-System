const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { startIntegration, intake, TEST_PASSWORD } = require('../../test-support/integration');

/**
 * Two requests at once, in a set order over the real API and MongoDB: `first` stops right after the
 * read that `match` picks out (its checks done, its writes not committed), `second` runs meanwhile,
 * then `first` goes on. Returns both responses.
 */
async function interleave(Model, match, first, second) {
  const original = Model.findOne;
  let reached;
  let release;
  const atCheck = new Promise((resolve) => { reached = resolve; });
  const go = new Promise((resolve) => { release = resolve; });
  let held = false;
  Model.findOne = function findOneHeld(filter, ...rest) {
    const query = original.call(this, filter, ...rest);
    if (!held && match(filter || {})) {
      held = true;
      const { exec } = query;
      query.exec = async function execHeld(...args) {
        const found = await exec.apply(this, args);
        reached();
        await go;
        return found;
      };
    }
    return query;
  };
  try {
    const one = first();
    await Promise.race([atCheck, one.then((r) => { throw new Error(`the first request ended before its check (${r.status})`); })]);
    const two = second();
    // Let the second request run into the first one's uncommitted writes before the first one goes on.
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    release();
    return await Promise.all([one, two]);
  } finally {
    release();
    Model.findOne = original;
  }
}

// The stall catalogue and the stable map: the Manager lays out zones, horses go into stalls by id or by
// code, a stall under maintenance or taken can't be given, and each role sees the map with only its
// own horses named.
test('stall catalogue and stable map against real MongoDB', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('stalls');
  t.after(() => ctx.close());
  const { api, raw, users, models, tokens } = ctx;
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

  await t.test('only a horse the club manages gets a stall', async () => {
    const a04 = await stallOf('A-04');
    const ghost = '000000000000000000000099';
    assert.equal((await raw('manager', 'POST', '/stable/assignments', { horse: ghost, stall: a04._id })).status, 404);
    assert.equal((await raw('manager', 'POST', '/stable/assignments', { horse: 'not-an-id', stall: a04._id })).status, 400);
    const sold = await api('manager', 'POST', '/horses', { name: 'TEST Stall Sold', breed: 'Arabian' }, 201);
    await api('manager', 'PATCH', `/horses/${sold._id}/archive`, { reason: 'Đã bán' });
    const refused = await raw('manager', 'POST', '/stable/assignments', { horse: sold._id, stall: a04._id });
    assert.equal(refused.status, 409);
    assert.match(refused.body.message, /ngừng quản lý/);
    assert.equal(await models.StableAssignment.countDocuments({ horse: { $in: [ghost, sold._id] } }), 0, 'nothing is saved for them');
    // The map and the placement agree: the stall shown free takes a horse.
    assert.equal((await stallOf('A-04')).occupied, false);
    const next = await api('manager', 'POST', '/horses', { name: 'TEST Stall Next', breed: 'Arabian' }, 201);
    await api('manager', 'POST', '/stable/assignments', { horse: next._id, stall: a04._id }, 201);
  });

  // Requests on the same records at the same moment, in a set order (see interleave).
  let r;
  const newHorse = async (name) => api('manager', 'POST', '/horses', { name, breed: 'Arabian' }, 201);
  const placementCheck = (horseId) => (f) => Boolean(f.$or) && String(f.horse?.$ne) === String(horseId);
  const occupancyCheck = (stallId) => (f) => Object.keys(f).length === 1 && String(f.stall) === String(stallId);

  await t.test('an archive during a placement leaves no stall to the archived horse', async () => {
    const { created } = await api('manager', 'POST', '/stable/stalls/generate', { zone: 'R', count: 5, zoneName: 'Khu R' }, 201);
    r = Object.fromEntries(created.map((s) => [s.code, s]));
    const leaving = await newHorse('TEST Stall Leaving');
    const [placed, archived] = await interleave(
      models.StableAssignment,
      placementCheck(leaving._id),
      () => raw('manager', 'POST', '/stable/assignments', { horse: leaving._id, stall: r['R-01']._id }),
      () => raw('manager', 'PATCH', `/horses/${leaving._id}/archive`, { reason: 'Chuyển trại' }),
    );
    assert.equal(placed.status, 201, 'the placement that started first goes through');
    assert.equal(archived.status, 200, 'and the archive frees the stall after it');
    assert.equal(await models.StableAssignment.countDocuments({ horse: leaving._id }), 0);
    assert.equal((await stallOf('R-01')).occupied, false);
    const after = await newHorse('TEST Stall After');
    await api('manager', 'POST', '/stable/assignments', { horse: after._id, stall: r['R-01']._id }, 201);
  });

  await t.test('maintenance and a placement at the same moment: whichever goes first, the other is refused', async () => {
    const busy = await newHorse('TEST Stall Busy');
    // Maintenance found R-02 empty and is about to save it; the placement meets it.
    const [closed, placed] = await interleave(
      models.StableAssignment,
      occupancyCheck(r['R-02']._id),
      () => raw('manager', 'PATCH', `/stable/stalls/${r['R-02']._id}`, { status: 'maintenance', maintenanceNote: 'Sửa máng' }),
      () => raw('manager', 'POST', '/stable/assignments', { horse: busy._id, stall: r['R-02']._id }),
    );
    assert.equal(closed.status, 200);
    assert.equal(placed.status, 409);
    assert.match(placed.body.message, /bảo trì/);
    const r02 = await stallOf('R-02');
    assert.equal(r02.status, 'maintenance');
    assert.equal(r02.occupied, false);

    // The other way round: the placement found R-03 free and is about to save; maintenance meets it.
    const [placedFirst, closedLate] = await interleave(
      models.StableAssignment,
      placementCheck(busy._id),
      () => raw('manager', 'POST', '/stable/assignments', { horse: busy._id, stall: r['R-03']._id }),
      () => raw('manager', 'PATCH', `/stable/stalls/${r['R-03']._id}`, { status: 'maintenance' }),
    );
    assert.equal(placedFirst.status, 201);
    assert.equal(closedLate.status, 409);
    const r03 = await stallOf('R-03');
    assert.equal(r03.status, 'active');
    assert.equal(r03.occupant.horse.name, 'TEST Stall Busy');
  });

  await t.test('two Managers on one stall: retiring or placing, one change wins and the other gets a 409', async () => {
    const second = await models.User.create({ name: 'TEST manager 2', email: 'manager2@integration.test', passwordHash: await bcrypt.hash(TEST_PASSWORD, 4), role: 'manager' });
    tokens.manager2 = (await api(null, 'POST', '/auth/login', { email: second.email, password: TEST_PASSWORD })).token;
    const first = await newHorse('TEST Stall First');
    const late = await newHorse('TEST Stall Late');

    // Retiring R-04 found it empty; the other Manager's placement meets it.
    const [retired, placedRetired] = await interleave(
      models.StableAssignment,
      occupancyCheck(r['R-04']._id),
      () => raw('manager', 'DELETE', `/stable/stalls/${r['R-04']._id}`),
      () => raw('manager2', 'POST', '/stable/assignments', { horse: late._id, stall: r['R-04']._id }),
    );
    assert.equal(retired.status, 200);
    assert.equal(placedRetired.status, 409);
    assert.match(placedRetired.body.message, /ngừng sử dụng/);
    assert.equal(await models.StableAssignment.countDocuments({ stall: r['R-04']._id }), 0);

    // Two horses into R-05: the second Manager is told who got there first, not a duplicate-key error.
    const [won, lost] = await interleave(
      models.StableAssignment,
      placementCheck(first._id),
      () => raw('manager', 'POST', '/stable/assignments', { horse: first._id, stall: r['R-05']._id }),
      () => raw('manager2', 'POST', '/stable/assignments', { horse: late._id, stall: r['R-05']._id }),
    );
    assert.equal(won.status, 201);
    assert.equal(lost.status, 409);
    assert.match(lost.body.message, /đang có ngựa TEST Stall First/);
  });

  await t.test('a caretaker whose account is locked or moved to another role no longer counts as assigned', async () => {
    const gate = async () => (await api('trainer', 'GET', `/training/sessions/readiness?horse=${horse._id}`)).gates.find((g) => g.key === 'care_assignment');
    const stallItem = async () => (await api('manager', 'GET', `/horses/${horse._id}/checklist`)).items.find((i) => i.key === 'stall');
    const queueRow = async () => (await api('manager', 'GET', '/horses/checklist')).find((row) => String(row.horse._id) === horse._id);
    assert.equal((await gate()).status, 'ok');
    assert.equal((await stallItem()).done, true);

    await api('manager', 'PUT', `/users/${users.groom.id}`, { isActive: false });
    const locked = await gate();
    assert.equal(locked.status, 'caution', 'the same level as a stall with nobody named, not a block');
    assert.match(locked.detail, /bị khóa/);
    const item = await stallItem();
    assert.equal(item.done, false);
    assert.match(item.detail, /cần người thay/);
    assert.equal((await queueRow()).items.find((i) => i.key === 'stall').done, false, "the Manager's queue counts the horse");

    // A working groom takes over: everything agrees again.
    const replacement = await models.User.create({ name: 'TEST groom 2', email: 'groom2@integration.test', passwordHash: 'not-used', role: 'groom' });
    await api('manager', 'POST', '/stable/assignments', { horse: horse._id, stall: (await stallOf('A-02'))._id, assignedCaretaker: replacement.id }, 201);
    assert.equal((await gate()).status, 'ok');
    assert.equal((await stallItem()).done, true);

    await api('manager', 'PUT', `/users/${replacement.id}`, { role: 'owner' });
    const moved = await gate();
    assert.equal(moved.status, 'caution');
    assert.match(moved.detail, /không còn là nhân viên chăm sóc/);
    assert.equal((await stallItem()).done, false);
  });
});
