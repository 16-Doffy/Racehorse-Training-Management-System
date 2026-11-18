const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, clock, mealSlotAt } = require('../../test-support/integration');

test('editing expiryDate via PUT syncs undated batches so FEFO feeding preserves HSD', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('invexpiry');
  t.after(() => ctx.close());
  const { api, models } = ctx;

  const item = await api('manager', 'POST', '/inventory', {
    name: 'TEST Oats HSD',
    category: 'feed',
    feedType: 'concentrate',
    unit: 'kg',
    quantity: 50,
  }, 201);
  await api('manager', 'POST', `/inventory/${item._id}/receive`, { quantity: 25 });

  const hsd = new Date(Date.now() + 180 * 86400000);
  hsd.setHours(0, 0, 0, 0);

  const updated = await api('manager', 'PUT', `/inventory/${item._id}`, {
    name: item.name,
    category: item.category,
    feedType: item.feedType,
    unit: item.unit,
    quantity: 75,
    expiryDate: hsd.toISOString(),
  });
  assert.ok(updated.expiryDate, 'updated item keeps expiryDate');
  assert.equal(updated.batches.length, 2);
  assert.ok(updated.batches.every((b) => new Date(b.expiryDate).getTime() === hsd.getTime()), 'undated batches inherit edited HSD');

  // Completing a feeding task deducts stock via FEFO and must keep expiryDate intact.
  const { horse } = await intake(ctx, 'TEST HSD Horse');
  const now = new Date();
  await api('trainer', 'POST', '/feeding', {
    horse: horse._id,
    mealTime: mealSlotAt(now),
    timeOfDay: clock(now),
    items: [{ inventoryItem: item._id, amount: 2 }],
  }, 201);
  const task = await models.DailyTask.findOne({ horse: horse._id, taskType: 'feeding' }).lean();
  await api('groom', 'PATCH', `/stable/tasks/${task._id}/complete`, {
    clientOpId: `hsd-${task._id}`,
    observation: { appetite: 'Tốt', manure: 'Bình thường', waterIntake: 'Bình thường' },
    amountEatenPercent: 100,
  });

  const afterFeed = await api('manager', 'GET', `/inventory/${item._id}`);
  assert.equal(afterFeed.quantity, 73);
  assert.equal(new Date(afterFeed.expiryDate).getTime(), hsd.getTime());
});
