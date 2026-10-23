const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration } = require('../../test-support/integration');

// A zone as a whole, from one dialog: the Manager renames it, takes empty stalls out and adds new ones in
// one save, and takes the whole zone out of use once no horse is left in it. Codes stay reserved, so a
// stall taken out comes back when its number is used again.
test('stall zones: one save renames, takes stalls out and adds new ones; a zone goes only when empty', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('zones');
  t.after(() => ctx.close());
  const { api, raw, users } = ctx;
  await api('manager', 'POST', '/stable/stalls/generate', { zone: 'A', count: 4, zoneName: 'Khu A', zonePurpose: 'Ngựa đua' }, 201);
  await api('manager', 'POST', '/stable/stalls/generate', { zone: 'B', count: 2, zoneName: 'Khu B' }, 201);
  const map = async () => (await api('manager', 'GET', '/stable/stalls')).stalls;
  const zoneA = async () => (await map()).filter((s) => s.zone === 'A');
  const idOf = async (code) => (await map()).find((s) => s.code === code)._id;
  const horse = await api('manager', 'POST', '/horses', { name: 'TEST Zone Horse', owner: users.owner.id }, 201);
  // A-01 has its groom; the stalls added later start without one.
  await api('manager', 'PUT', `/stable/stalls/${(await map()).find((st) => st.code === 'A-01')._id}/caretaker`, { caretaker: users.groom.id });

  await t.test('a zone is renamed on every stall of it; the key never changes', async () => {
    const saved = await api('manager', 'PUT', '/stable/zones/a', { zoneName: 'Khu ngựa đua', zonePurpose: 'Giải tháng 11' });
    assert.deepEqual(saved.added, []);
    assert.deepEqual(saved.removed, []);
    assert.ok((await zoneA()).every((s) => s.zoneName === 'Khu ngựa đua' && s.zonePurpose === 'Giải tháng 11'));
    assert.equal((await map()).find((s) => s.code === 'B-01').zoneName, 'Khu B', 'other zones stay as they were');
    assert.equal((await raw('manager', 'PUT', '/stable/zones/A', { zoneName: '  ' })).status, 400);
    assert.equal((await raw('manager', 'PUT', '/stable/zones/A', {})).status, 400, 'nothing to change');
    assert.equal((await raw('manager', 'PUT', '/stable/zones/ZZ', { zoneName: 'X' })).status, 404);
    assert.equal((await raw('trainer', 'PUT', '/stable/zones/A', { zoneName: 'X' })).status, 403);
  });

  await t.test('one save takes empty stalls out and adds new ones after the highest number, without a groom yet', async () => {
    const saved = await api('manager', 'PUT', '/stable/zones/A', { remove: [await idOf('A-02'), await idOf('A-04')], add: 2, type: 'recovery' });
    assert.deepEqual(saved.removed, ['A-02', 'A-04']);
    assert.deepEqual(saved.added, ['A-05', 'A-06'], 'not A-04 again: it was just taken out');
    const now = await zoneA();
    assert.deepEqual(now.map((s) => s.code), ['A-01', 'A-03', 'A-05', 'A-06']);
    const added = now.filter((s) => ['A-05', 'A-06'].includes(s.code));
    assert.ok(added.every((s) => s.type === 'recovery' && s.zoneName === 'Khu ngựa đua'));
    assert.ok(added.every((s) => s.caretaker === null), 'a new stall gets its groom from the Manager, stall by stall');
  });

  await t.test('a stall with a horse is not taken out, and nothing of that save happens', async () => {
    await api('manager', 'POST', '/stable/assignments', { horse: horse._id, stall: await idOf('A-03') }, 201);
    const refused = await raw('manager', 'PUT', '/stable/zones/A', { zoneName: 'Đổi tên', remove: [await idOf('A-03')], add: 1 });
    assert.equal(refused.status, 409);
    assert.match(refused.body.message, /TEST Zone Horse \(A-03\)/);
    const now = await zoneA();
    assert.equal(now.length, 4, 'no stall added, none taken out');
    assert.ok(now.every((s) => s.zoneName === 'Khu ngựa đua'), 'and the name did not change');
    assert.equal((await raw('manager', 'PUT', '/stable/zones/A', { remove: [await idOf('B-01')] })).status, 400, 'a stall of another zone');
  });

  await t.test('a number used before comes back as new when the zone grows past it', async () => {
    const saved = await api('manager', 'PUT', '/stable/zones/B', { remove: [await idOf('B-02')] });
    assert.deepEqual(saved.removed, ['B-02']);
    const grown = await api('manager', 'PUT', '/stable/zones/B', { add: 2 });
    assert.deepEqual(grown.added, ['B-02', 'B-03']);
    assert.equal((await raw('manager', 'PUT', '/stable/zones/B', { remove: [await idOf('B-01'), await idOf('B-02'), await idOf('B-03')] })).status, 400, 'not every stall: that is deleting the zone');
  });

  await t.test('a zone with a horse in it is not deleted; an empty one leaves the map', async () => {
    const refused = await raw('manager', 'DELETE', '/stable/zones/A');
    assert.equal(refused.status, 409);
    assert.match(refused.body.message, /TEST Zone Horse \(A-03\)/);
    const gone = await api('manager', 'DELETE', '/stable/zones/B');
    assert.deepEqual(gone.retired, ['B-01', 'B-02', 'B-03']);
    assert.ok((await map()).every((s) => s.zone === 'A'));
    assert.equal((await raw('manager', 'DELETE', '/stable/zones/B')).status, 404, 'already gone');
    assert.equal((await raw('groom', 'DELETE', '/stable/zones/A')).status, 403);
  });

  await t.test('laying a deleted zone out again brings its stalls back, as new', async () => {
    const again = await api('manager', 'POST', '/stable/stalls/generate', { zone: 'B', count: 3, zoneName: 'Khu B mới' }, 201);
    assert.deepEqual(again.created.map((s) => s.code).sort(), ['B-01', 'B-02', 'B-03']);
    const zoneB = (await map()).filter((s) => s.zone === 'B');
    assert.ok(zoneB.every((s) => s.zoneName === 'Khu B mới' && s.isActive && s.caretaker === null));
  });
});
