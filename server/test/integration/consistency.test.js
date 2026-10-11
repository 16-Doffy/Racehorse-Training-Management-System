const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, clock, day } = require('../../test-support/integration');

test('result/prize and care/stock stay consistent under concurrency and failures', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('consistency');
  t.after(() => ctx.close());
  const { horse } = await intake(ctx, 'TEST Consistency');
  const { api, raw, users, models } = ctx;
  await t.test('concurrent first race results create one prize and one achievement', async () => {
    const race = await api('trainer', 'POST', '/races', { horse: horse._id, raceName: 'TEST Concurrent Cup', raceDate: day().toISOString(), distance: 1600 }, 201);
    const results = await Promise.all(Array.from({ length: 6 }, () => raw('trainer', 'PATCH', `/races/${race._id}/results`, { position: 1, prizeMoney: 500000 })));
    assert.ok(results.every((r) => [200, 409].includes(r.status)), JSON.stringify(results));
    const prizes = await models.FinancialRecord.find({ horse: horse._id, source: 'race_prize' });
    assert.equal(prizes.length, 1, 'Concurrent submission must not multiply prize money');
    assert.equal((await models.Horse.findById(horse._id)).achievements.filter((a) => a.race === race.raceName).length, 1);
    const saved = await models.RaceEntry.findById(race._id);
    assert.equal(String(saved.financeRecord), prizes[0].id);
    assert.equal(await models.Notification.countDocuments({ horse: horse._id, type: 'race_result', message: /TEST Concurrent Cup/ }), 1);
  });
  await t.test('two editions with the same race name retain separate achievements', async () => {
    const first = await api('trainer', 'POST', '/races', { horse: horse._id, raceName: 'TEST Annual Cup', raceDate: day().toISOString(), distance: 1600 }, 201);
    const second = await api('trainer', 'POST', '/races', { horse: horse._id, raceName: 'TEST Annual Cup', raceDate: day().toISOString(), distance: 1600 }, 201);
    await api('trainer', 'PATCH', `/races/${first._id}/results`, { position: 1 });
    await api('trainer', 'PATCH', `/races/${second._id}/results`, { position: 2 });
    assert.equal((await models.Horse.findById(horse._id)).achievements.filter((a) => a.race === 'TEST Annual Cup').length, 2);
  });
  await t.test('failure after stock update rolls back task and all stock, then same op can retry', async () => {
    const item = await api('manager', 'POST', '/inventory', { name: 'TEST failure feed', category: 'feed', unit: 'kg', quantity: 10 }, 201);
    const task = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'cleaning', scheduledDate: day(), dueTime: clock(), supplies: [{ inventoryItem: item._id, amount: 2 }] });
    const original = models.InventoryItem.updateOne;
    let updates = 0;
    models.InventoryItem.updateOne = async function (...args) {
      const result = await original.apply(this, args);
      if (++updates === 1) throw new Error('Injected failure after first stock decrement');
      return result;
    };
    const payload = { clientOpId: 'retry-after-db-error', performedAt: new Date().toISOString() };
    try {
      const failed = await raw('groom', 'PATCH', `/stable/tasks/${task._id}/complete`, payload);
      assert.equal(failed.status, 500);
      assert.equal(updates, 1, 'Fault injection must reach the stock decrement');
    } finally {
      models.InventoryItem.updateOne = original;
    }
    const after = await models.DailyTask.findById(task._id);
    assert.equal(after.status, 'pending', 'No completed task may survive a failed stock transaction');
    assert.equal((await models.InventoryItem.findById(item._id)).quantity, 10);
    assert.ok(!after.opIds.includes(payload.clientOpId));
    await api('groom', 'PATCH', `/stable/tasks/${task._id}/complete`, payload);
    assert.equal((await models.InventoryItem.findById(item._id)).quantity, 8);
  });
  await t.test('concurrent care completions consume supplies once and competing tasks cannot overspend', async () => {
    const item = await api('manager', 'POST', '/inventory', { name: 'TEST scarce feed', category: 'feed', unit: 'kg', quantity: 3 }, 201);
    const makeTask = () => models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'cleaning', scheduledDate: day(), dueTime: clock(), supplies: [{ inventoryItem: item._id, amount: 2 }] });
    const first = await makeTask();
    const second = await makeTask();
    const results = await Promise.all([
      ...Array.from({ length: 4 }, () => raw('groom', 'PATCH', `/stable/tasks/${first._id}/complete`, { clientOpId: 'same-care-op' })),
      raw('groom', 'PATCH', `/stable/tasks/${second._id}/complete`, { clientOpId: 'competing-care-op' }),
    ]);
    assert.ok(results.every((r) => [200, 409].includes(r.status)), JSON.stringify(results));
    assert.equal(await models.DailyTask.countDocuments({ _id: { $in: [first._id, second._id] }, status: 'completed' }), 1);
    assert.equal((await models.InventoryItem.findById(item._id)).quantity, 1);
  });
  await t.test('prize can be removed and recreated without a duplicate linked financial record', async () => {
    const race = await api('trainer', 'POST', '/races', { horse: horse._id, raceName: 'TEST prize correction', raceDate: day().toISOString(), distance: 1600 }, 201);
    for (const prizeMoney of [400000, 0, 600000]) await api('trainer', 'PATCH', `/races/${race._id}/results`, { position: 1, prizeMoney });
    const prizes = await models.FinancialRecord.find({ raceEntry: race._id });
    assert.equal(prizes.length, 1);
    assert.equal(prizes[0].amount, 600000);
    assert.equal((await models.Horse.findById(horse._id)).achievements.filter((a) => String(a.raceEntry) === race._id).length, 1);
  });
  await t.test('failure while writing achievement rolls back result and prize, then retry succeeds', async () => {
    const race = await api('trainer', 'POST', '/races', { horse: horse._id, raceName: 'TEST atomic result', raceDate: day().toISOString(), distance: 1600 }, 201);
    const original = models.Horse.updateOne;
    let injected = false;
    models.Horse.updateOne = async function (...args) {
      const result = await original.apply(this, args);
      if (args[1]?.$push?.achievements && !injected) {
        injected = true;
        throw new Error('Injected failure after achievement write');
      }
      return result;
    };
    try {
      assert.equal((await raw('trainer', 'PATCH', `/races/${race._id}/results`, { position: 1, prizeMoney: 700000 })).status, 500);
    } finally { models.Horse.updateOne = original; }
    assert.ok(injected);
    assert.equal((await models.RaceEntry.findById(race._id)).status, 'registered');
    assert.equal(await models.FinancialRecord.countDocuments({ raceEntry: race._id }), 0);
    assert.equal((await models.Horse.findById(horse._id)).achievements.filter((a) => String(a.raceEntry) === race._id).length, 0);
    await api('trainer', 'PATCH', `/races/${race._id}/results`, { position: 1, prizeMoney: 700000 });
    assert.equal(await models.FinancialRecord.countDocuments({ raceEntry: race._id }), 1);
  });
  await t.test('notification failure after commit still returns success and retry cannot deduct again', async () => {
    const item = await api('manager', 'POST', '/inventory', { name: 'TEST notification failure feed', category: 'feed', unit: 'kg', quantity: 10, reorderLevel: 9 }, 201);
    const task = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'cleaning', scheduledDate: day(), dueTime: clock(), supplies: [{ inventoryItem: item._id, amount: 2 }] });
    const original = models.Notification.create;
    let injected = false;
    models.Notification.create = async function (...args) {
      if (args[0]?.type === 'low_stock') { injected = true; throw new Error('Injected notification failure'); }
      return original.apply(this, args);
    };
    const payload = { clientOpId: 'notification-failure-care' };
    try { await api('groom', 'PATCH', `/stable/tasks/${task._id}/complete`, payload); }
    finally { models.Notification.create = original; }
    assert.ok(injected);
    assert.equal((await models.DailyTask.findById(task._id)).status, 'completed');
    assert.equal((await models.InventoryItem.findById(item._id)).quantity, 8);
    await api('groom', 'PATCH', `/stable/tasks/${task._id}/complete`, payload);
    assert.equal((await models.InventoryItem.findById(item._id)).quantity, 8);
  });
});
