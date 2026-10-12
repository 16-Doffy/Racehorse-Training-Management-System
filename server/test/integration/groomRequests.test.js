const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, clock, day } = require('../../test-support/integration');

// What the Groom module asked of the backend (docs/GROOM_REPORT.md): DEP-01 route of a medicine,
// DEP-02 missed doses reach the vet, DEP-03 partial approval / priority / destination, DEP-05 hoof
// care, DEP-06 rations tied to stock, DEP-09 a restock request only names the requester's own work.
test('groom requests: route, missed doses, restock approval, hoof care, rations, task ownership', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('groom_requests');
  t.after(() => ctx.close());
  const { api, raw, users, models } = ctx;
  const { horse, record } = await intake(ctx, 'TEST Requests Horse');
  const feed = await api('manager', 'POST', '/inventory', { name: 'TEST oats', category: 'feed', unit: 'kg', quantity: 50 }, 201);
  const medicine = await api('manager', 'POST', '/inventory', { name: 'TEST penicillin', category: 'medicine', unit: 'ml', quantity: 100 }, 201);

  await t.test('DEP-06: a ration line must be a stock item, and a ration has at least one', async () => {
    const text = await raw('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'morning', timeOfDay: '06:00', items: [{ type: 'grain', quantity: '2kg' }] });
    assert.equal(text.status, 400);
    assert.match(text.body.message, /chọn mặt hàng trong kho/);
    assert.equal((await raw('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'morning', timeOfDay: '06:00', items: [] })).status, 400);
    assert.equal((await raw('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'morning', timeOfDay: '06:00' })).status, 400);
    const ration = await api('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'morning', timeOfDay: '06:00', items: [{ inventoryItem: feed._id, amount: 2 }] }, 201);
    assert.ok(ration.approvedBy, 'saving stamps the approver');
    assert.equal(String(ration.items[0].inventoryItem), feed._id);
  });

  await t.test('DEP-05: hoof care is its own kind of task', async () => {
    const due = new Date(Date.now() + 5 * 60000);
    const task = await api('trainer', 'POST', '/stable/tasks', { horse: horse._id, assignedTo: users.groom.id, taskType: 'hoof_care', dueTime: clock(due), scheduledDate: due.toISOString() }, 201);
    assert.equal(task.taskType, 'hoof_care');
    assert.ok((await api('groom', 'GET', `/stable/tasks?horse=${horse._id}`)).some((x) => x._id === task._id));
  });

  await t.test('DEP-09: a restock request names only the requester\'s own task', async () => {
    const otherGroom = await models.User.create({ name: 'TEST other groom', email: 'other-groom-req@integration.test', passwordHash: 'not-used', role: 'groom' });
    const theirs = await models.DailyTask.create({ horse: horse._id, assignedTo: otherGroom._id, taskType: 'cleaning', scheduledDate: day(), dueTime: '23:59' });
    const mine = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'cleaning', scheduledDate: day(), dueTime: '23:59' });
    const refused = await raw('groom', 'POST', `/inventory/${feed._id}/restock-request`, { quantity: 5, task: String(theirs._id) });
    assert.equal(refused.status, 403);
    await api('groom', 'POST', `/inventory/${feed._id}/restock-request`, { quantity: 5, task: String(mine._id) });
  });

  await t.test('DEP-03: priority and destination on a request; the Manager approves part of it; the delivery follows', async () => {
    assert.equal((await raw('groom', 'POST', `/inventory/${feed._id}/restock-request`, { quantity: 20, priority: 'asap' })).status, 400);
    const item = await api('groom', 'POST', `/inventory/${feed._id}/restock-request`, { quantity: 20, priority: 'urgent', destinationBlock: 'Block A', note: 'TEST running low' });
    const request = item.restockRequests.at(-1);
    assert.equal(request.priority, 'urgent');
    assert.equal(request.destinationBlock, 'Block A');
    assert.ok(await models.Notification.exists({ recipientRole: 'manager', message: /KHẨN.*TEST oats.*Block A/ }), 'the Manager sees it is urgent and where it goes');
    const tooMuch = await raw('manager', 'PATCH', `/inventory/${feed._id}/restock-requests/${request._id}`, { status: 'approved', approvedQuantity: 25 });
    assert.equal(tooMuch.status, 400);
    const approved = await api('manager', 'PATCH', `/inventory/${feed._id}/restock-requests/${request._id}`, { status: 'approved', approvedQuantity: 15 });
    assert.equal(approved.restockRequests.find((r) => r._id === request._id).approvedQuantity, 15);
    const before = (await models.InventoryItem.findById(feed._id)).quantity;
    await api('manager', 'POST', `/inventory/${feed._id}/receive`, { requestId: request._id });
    const after = await models.InventoryItem.findById(feed._id);
    assert.equal(after.quantity, before + 15, 'the delivery defaults to what was approved');
    assert.equal(after.restockRequests.id(request._id).receivedQty, 15);
  });

  await t.test('DEP-01: a medicine carries how it is given, and the groom sees it', async () => {
    const bad = await raw('vet', 'POST', '/health/treatments', { horse: horse._id, healthRecord: record._id, medications: [{ name: 'TEST drops', dosage: '1 giọt', route: 'nose', times: ['08:00'] }] });
    assert.equal(bad.status, 400);
    const treatment = await api('vet', 'POST', '/health/treatments', {
      horse: horse._id,
      healthRecord: record._id,
      medications: [{ name: 'TEST penicillin', inventoryItem: medicine._id, amount: 2, route: 'im', times: ['08:00'] }],
    }, 201);
    assert.equal(treatment.medications[0].route, 'im');
    const plan = await api('groom', 'GET', `/stable/my-care-plan?horse=${horse._id}`);
    const meds = plan.flatMap((sheet) => sheet.prescriptions.flatMap((p) => p.medications));
    assert.ok(meds.some((m) => m.name === 'TEST penicillin' && m.route === 'im'), JSON.stringify(meds));
  });

  await t.test('DEP-02: a dose whose window closed unrecorded tells the vet once; old history does not', async () => {
    const { notifyMissedDoses } = require('../../src/modules/stable/missedCare.service');
    const yesterday = day(-1);
    const missed = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'medication', source: 'vet', scheduledDate: yesterday, dueTime: '08:00', note: 'TEST kháng sinh' });
    const old = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'medication', source: 'vet', scheduledDate: day(-4), dueTime: '08:00', note: 'TEST liều cũ' });
    const done = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'medication', source: 'vet', scheduledDate: yesterday, dueTime: '09:00', note: 'TEST đã cho', status: 'completed', completedAt: yesterday });
    assert.ok((await notifyMissedDoses()) >= 1);
    const told = await models.Notification.find({ type: 'care_order', message: /TEST kháng sinh.*quá khung giờ/ });
    assert.equal(told.length, 1);
    assert.equal(String(told[0].recipientUser), users.vet.id, 'the vet responsible for the horse');
    assert.equal(await notifyMissedDoses(), 0, 'told once');
    assert.ok((await models.DailyTask.findById(missed._id)).missedNotifiedAt);
    assert.equal((await models.DailyTask.findById(old._id)).missedNotifiedAt, null, 'older than yesterday is left alone');
    assert.equal((await models.DailyTask.findById(done._id)).missedNotifiedAt, null);
    assert.equal((await models.DailyTask.findById(missed._id)).status, 'pending', 'nothing is rescheduled or recorded for the groom');
  });
});
