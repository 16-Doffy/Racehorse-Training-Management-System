const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, clock, day, mealSlotAt } = require('../../test-support/integration');

// The groom's side of the work: what may be recorded, what it takes out of stock, and what it tells
// the people who ordered it. Other roles appear only to set up the work the groom carries out.
test('groom care work against real MongoDB', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('groom');
  t.after(() => ctx.close());
  const { api, raw, users, models } = ctx;
  const { horse, record } = await intake(ctx, 'TEST Groom Horse');
  const stockOf = async (id) => (await models.InventoryItem.findById(id)).quantity;
  const myTasks = (query = '') => api('groom', 'GET', `/stable/tasks?horse=${horse._id}${query}`);

  await t.test('a meal without an approved ration cannot be recorded, only reported as not done', async () => {
    // The stall assignment made a plain "feed the horse" task: no ration exists for this horse yet.
    const generic = (await myTasks()).find((task) => task.taskType === 'feeding' && !task.mealSlot);
    assert.ok(generic, 'assignment creates a daily feeding task for a horse without a ration');
    const refused = await raw('groom', 'PATCH', `/stable/tasks/${generic._id}/complete`, {});
    assert.equal(refused.status, 409);
    assert.equal(refused.body.data.code, 'NO_APPROVED_RATION');
    assert.equal((await models.DailyTask.findById(generic._id)).status, 'pending');

    const notDone = await api('groom', 'PATCH', `/stable/tasks/${generic._id}/not-done`, { reason: 'Chưa có khẩu phần được duyệt' });
    assert.equal(notDone.status, 'skipped', 'not done is skipped, never completed');
    assert.equal(notDone.skipReason, 'Chưa có khẩu phần được duyệt');
  });

  let hay;
  let meal;
  await t.test('a meal short of stock is refused with what is missing, then recorded once', async () => {
    hay = await api('manager', 'POST', '/inventory', { name: 'TEST Groom hay', category: 'feed', unit: 'kg', quantity: 1 }, 201);
    await api('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: mealSlotAt(), timeOfDay: clock(), items: [{ inventoryItem: hay._id, amount: 3 }] }, 201);
    meal = (await myTasks()).find((task) => task.taskType === 'feeding' && task.mealSlot === mealSlotAt());
    assert.ok(meal);
    assert.deepEqual(meal.supplyStatus, {
      ok: false,
      missing: [{ inventoryItem: hay._id, name: 'TEST Groom hay', unit: 'kg', needed: 3, available: 1, short: 2 }],
    });

    const short = await raw('groom', 'PATCH', `/stable/tasks/${meal._id}/complete`, {});
    assert.equal(short.status, 409);
    assert.equal(short.body.data.missing[0].short, 2);
    assert.equal(await stockOf(hay._id), 1, 'a refused meal takes nothing');
    assert.equal((await models.DailyTask.findById(meal._id)).status, 'pending');

    await api('manager', 'POST', `/inventory/${hay._id}/receive`, { quantity: 9 });
    await api('groom', 'PATCH', `/stable/tasks/${meal._id}/complete`, { observation: { appetite: 'Kém', manure: 'Bình thường', waterIntake: 'Bình thường' }, amountEatenPercent: 60, clientOpId: 'g-meal-1' });
    // A double tap resends the same op; a second, different completion adds nothing to stock either.
    await api('groom', 'PATCH', `/stable/tasks/${meal._id}/complete`, { clientOpId: 'g-meal-1' });
    await api('groom', 'PATCH', `/stable/tasks/${meal._id}/complete`, { clientOpId: 'g-meal-2', notes: 'Bổ sung ghi chú' });
    assert.equal(await stockOf(hay._id), 7, 'the ration leaves stock exactly once');
    const saved = await models.DailyTask.findById(meal._id);
    assert.equal(saved.status, 'completed');
    assert.equal(saved.observation.appetite, 'partial');
    assert.equal(saved.observation.amountEatenPercent, 60, 'eaten is kept apart from what was issued');
    assert.equal(saved.supplies[0].amount, 3);
  });

  await t.test('eaten share is checked, and a refused meal counts as nothing eaten', async () => {
    const bad = await raw('groom', 'PATCH', `/stable/tasks/${meal._id}/complete`, { amountEatenPercent: 140 });
    assert.equal(bad.status, 400);
    const second = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: mealSlotAt(), scheduledDate: new Date(), supplies: [] });
    await api('groom', 'PATCH', `/stable/tasks/${second._id}/complete`, { observation: { appetite: 'Bỏ ăn' } });
    assert.equal((await models.DailyTask.findById(second._id)).observation.amountEatenPercent, 0);
  });

  await t.test('a meal slot with no approved ration cannot be recorded', async () => {
    // The horse has a ration for the current meal only; another meal's task has nothing approved behind it.
    const orphan = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: mealSlotAt() === 'evening' ? 'morning' : 'evening', scheduledDate: new Date(), supplies: [] });
    const refused = await raw('groom', 'PATCH', `/stable/tasks/${orphan._id}/complete`, {});
    assert.equal(refused.status, 409);
    assert.equal(refused.body.data.code, 'NO_APPROVED_RATION');
  });

  let medicine;
  let treatment;
  let doses;
  await t.test('each prescribed time is its own dose: giving the first leaves the second', async (sub) => {
    const first = new Date();
    const second = new Date(first.getTime() + 90 * 60000);
    if (second.getDate() !== first.getDate()) return sub.skip('too close to midnight for two doses today');
    medicine = await api('manager', 'POST', '/inventory', { name: 'TEST Bute', category: 'medicine', unit: 'viên', quantity: 10 }, 201);
    treatment = await api('vet', 'POST', '/health/treatments', {
      healthRecord: record._id,
      horse: horse._id,
      medications: [{ name: 'TEST Bute', dosage: '1 viên/lần', inventoryItem: medicine._id, amount: 1, times: [clock(first), clock(second)] }],
    }, 201);
    doses = (await myTasks()).filter((task) => task.taskType === 'medication').sort((a, b) => a.dueTime.localeCompare(b.dueTime));
    assert.deepEqual(doses.map((d) => d.dueTime), [clock(first), clock(second)]);

    await api('groom', 'PATCH', `/stable/tasks/${doses[0]._id}/complete`, { clientOpId: 'g-dose-1' });
    assert.equal((await models.DailyTask.findById(doses[0]._id)).status, 'completed');
    assert.equal((await models.DailyTask.findById(doses[1]._id)).status, 'pending', 'the later dose is untouched');
    assert.equal(await stockOf(medicine._id), 9);
  });

  await t.test('a dose follows the prescription as it is now', async (sub) => {
    if (!doses) return sub.skip('no doses from the previous step');
    // The vet raised the amount without changing the note: the dose takes the new amount.
    await models.Treatment.updateOne({ _id: treatment._id }, { $set: { 'medications.0.amount': 2 } });
    const later = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'medication', source: 'vet', treatment: treatment._id, note: doses[0].note, dueTime: doses[0].dueTime, scheduledDate: new Date(), supplies: doses[0].supplies });
    await api('groom', 'PATCH', `/stable/tasks/${later._id}/complete`, {});
    assert.equal(await stockOf(medicine._id), 7, 'two tablets, as now prescribed');
    assert.equal((await models.DailyTask.findById(later._id)).supplies[0].amount, 2);

    // An order the vet replaced (different note) is refused rather than given from the old one.
    await models.Treatment.updateOne({ _id: treatment._id }, { $set: { 'medications.0.dosage': '2 viên/lần' } });
    const stale = await raw('groom', 'PATCH', `/stable/tasks/${doses[1]._id}/complete`, {});
    assert.equal(stale.status, 409);
    assert.equal(stale.body.data.code, 'PRESCRIPTION_CHANGED');

    await models.Treatment.updateOne({ _id: treatment._id }, { $set: { status: 'completed' } });
    const ended = await raw('groom', 'PATCH', `/stable/tasks/${doses[1]._id}/complete`, {});
    assert.equal(ended.status, 409);
    assert.equal(ended.body.data.code, 'TREATMENT_ENDED');
    assert.equal(await stockOf(medicine._id), 7, 'refused doses take nothing');
  });

  await t.test('nothing is given from an expired item', async () => {
    const yesterday = day(-1);
    const old = await api('manager', 'POST', '/inventory', { name: 'TEST expired paste', category: 'medicine', unit: 'tuýp', quantity: 5, expiryDate: yesterday.toISOString() }, 201);
    const task = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'cleaning', scheduledDate: new Date(), supplies: [{ inventoryItem: old._id, name: old.name, amount: 1, unit: 'tuýp' }] });
    const refused = await raw('groom', 'PATCH', `/stable/tasks/${task._id}/complete`, {});
    assert.equal(refused.status, 409);
    assert.equal(refused.body.data.code, 'EXPIRED_SUPPLY');
    assert.equal(await stockOf(old._id), 5);
  });

  await t.test('a groom acts only on their own work', async () => {
    const otherGroom = await models.User.create({ name: 'TEST second groom', email: 'second-groom@integration.test', passwordHash: 'not-used', role: 'groom' });
    const theirs = await models.DailyTask.create({ horse: horse._id, assignedTo: otherGroom._id, taskType: 'cleaning', scheduledDate: new Date() });
    await api('groom', 'PATCH', `/stable/tasks/${theirs._id}/complete`, {}, 403);
    await api('groom', 'PATCH', `/stable/tasks/${theirs._id}/not-done`, { reason: 'x' }, 403);
    await api('groom', 'POST', '/stable/tasks', { horse: horse._id, assignedTo: users.groom.id, taskType: 'cleaning' }, 403);
    const listed = await api('groom', 'GET', `/stable/tasks?assignedTo=${otherGroom._id}`);
    assert.ok(listed.every((task) => String(task.assignedTo._id) === String(users.groom.id)), 'never a colleague\'s list');
  });

  await t.test('a supply request changes no stock until the delivery is received', async () => {
    const before = await stockOf(hay._id);
    const item = await api('groom', 'POST', `/inventory/${hay._id}/restock-request`, { quantity: 20, note: 'TEST cho bữa trưa', task: meal._id });
    const request = item.restockRequests.at(-1);
    assert.equal(request.status, 'pending');
    assert.equal(await stockOf(hay._id), before);

    await api('manager', 'PATCH', `/inventory/${hay._id}/restock-requests/${request._id}`, { status: 'approved' });
    assert.equal(await stockOf(hay._id), before, 'approved is ordered, not on the shelf');

    await api('manager', 'POST', `/inventory/${hay._id}/receive`, { requestId: request._id, quantity: 15 });
    assert.equal(await stockOf(hay._id), before + 15);
    const mine = (await api('groom', 'GET', '/inventory')).find((i) => i._id === hay._id).restockRequests.find((r) => r._id === request._id);
    assert.equal(mine.status, 'received');
    assert.equal(mine.receivedQty, 15, 'the groom sees what actually arrived');
  });

  await t.test('an incident carries its kind and when it happened', async () => {
    const task = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'cleaning', scheduledDate: new Date() });
    const at = new Date(Date.now() - 30 * 60000);
    const reported = await api('groom', 'POST', `/stable/tasks/${task._id}/incident`, { description: 'Móng trước trái bị nứt', severity: 'high', category: 'hoof_injury', occurredAt: at.toISOString() });
    assert.equal(reported.incidentReport.category, 'hoof_injury');
    assert.equal(new Date(reported.incidentReport.occurredAt).getTime(), at.getTime());
    assert.equal(reported.incidentReport.status, 'open');

    await api('groom', 'POST', `/stable/tasks/${task._id}/incident`, { description: 'x', category: 'unknown' }, 400);
    await api('groom', 'POST', `/stable/tasks/${task._id}/incident`, { description: 'x', occurredAt: new Date(Date.now() + 3600000).toISOString() }, 400);
    const vetBell = await models.Notification.findOne({ type: 'incident_report', message: /chấn thương móng/ });
    assert.ok(vetBell, 'the vet is told what kind of incident it is');
    // Reports from before these fields existed still list for the vet.
    const listed = await api('vet', 'GET', `/stable/incidents?horse=${horse._id}`);
    assert.ok(listed.some((row) => row._id === String(task._id)));
  });

  await t.test('a missed meal can still be reported: not given, or given and recorded late at its real time', async () => {
    // A meal of the slot that has a ration, scheduled 5 hours ago: its window (until 4 hours after) has closed.
    const scheduled = new Date(Date.now() - 5 * 3600000);
    const forgot = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: mealSlotAt(), scheduledDate: scheduled, supplies: [] });
    const now = await raw('groom', 'PATCH', `/stable/tasks/${forgot._id}/complete`, {});
    assert.equal(now.status, 409, 'ticking it now would record a meal at the wrong time');
    const late = await api('groom', 'PATCH', `/stable/tasks/${forgot._id}/complete`, { performedAt: new Date(scheduled.getTime() + 20 * 60000).toISOString(), clientOpId: 'g-late-1' });
    assert.equal(late.status, 'completed');
    assert.equal(late.recordedLate, true, 'shown as recorded late, never hidden');

    const missed = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: mealSlotAt(), scheduledDate: scheduled, supplies: [] });
    const notGiven = await api('groom', 'PATCH', `/stable/tasks/${missed._id}/not-done`, { reason: 'Ngựa không chịu ăn' });
    assert.equal(notGiven.status, 'skipped');
  });

  await t.test("the vet's appointment for a horse is on its groom's care plan", async () => {
    const request = await api('trainer', 'POST', '/health/exam-requests', { horse: horse._id, reason: 'TEST đi khập khiễng' }, 201);
    const open = (await api('groom', 'GET', `/stable/my-care-plan?horse=${horse._id}`))[0];
    assert.equal(open.exams.length, 1);
    assert.equal(open.exams[0].scheduledFor, null, 'no time until a vet takes it on');

    const at = new Date(Date.now() + 2 * 3600000);
    await api('vet', 'PATCH', `/health/exam-requests/${request._id}`, { action: 'accept', scheduledFor: at.toISOString() });
    const booked = (await api('groom', 'GET', `/stable/my-care-plan?horse=${horse._id}`))[0].exams[0];
    assert.equal(new Date(booked.scheduledFor).getTime(), at.getTime());
    assert.equal(booked.acceptedBy, 'TEST vet');
    assert.equal(booked.reason, 'TEST đi khập khiễng');
  });
});
