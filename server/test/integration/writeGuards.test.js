const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { startIntegration, intake, day } = require('../../test-support/integration');

// The side doors of review 79: generic updates must not get around the rules the main flows keep —
// MongoDB operators in a body or query, archiving without its flow, a run race changed after its
// result, a horse with money on the books deleted, work left with a groom no longer on the stall, and
// staff whose account was locked still counted as assigned.
test('write guards against real MongoDB', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('writeguards');
  t.after(() => ctx.close());
  const { api, raw, users, models } = ctx;

  await t.test('a body or query carrying MongoDB operators is refused before any route', async () => {
    const horse = await api('manager', 'POST', '/horses', { name: 'TEST guarded horse', owner: users.owner.id, assignedTrainer: users.trainer.id }, 201);
    await models.Horse.updateOne({ _id: horse._id }, { healthStatus: 'injured' });

    const injected = await raw('manager', 'PUT', `/horses/${horse._id}`, { $set: { healthStatus: 'eligible', assignedTrainer: users.groom.id } });
    assert.equal(injected.status, 400);
    const after = await models.Horse.findById(horse._id);
    assert.equal(after.healthStatus, 'injured', 'the health conclusion stays the vet’s');
    assert.equal(String(after.assignedTrainer), users.trainer.id);

    // Plain fields: the health conclusion is not the form's to write, and a groom is not a trainer.
    await api('manager', 'PUT', `/horses/${horse._id}`, { healthStatus: 'eligible', name: 'TEST guarded horse 2' });
    const renamed = await models.Horse.findById(horse._id);
    assert.equal(renamed.name, 'TEST guarded horse 2');
    assert.equal(renamed.healthStatus, 'injured');
    assert.equal((await raw('manager', 'PUT', `/horses/${horse._id}`, { assignedTrainer: users.groom.id })).status, 400);

    // A query value cannot become a filter either.
    assert.equal((await raw('trainer', 'GET', `/stable/assignments?horse[$ne]=${horse._id}`)).status, 400);
  });

  await t.test('a ration cannot be moved, with $set, to a horse the trainer does not look after', async () => {
    const { horse } = await intake(ctx, 'TEST ration owner');
    const foreign = await api('manager', 'POST', '/horses', { name: 'TEST someone else’s horse', owner: users.outsider.id }, 201);
    const oats = await api('manager', 'POST', '/inventory', { name: 'TEST yến mạch guard', category: 'feed', quantity: 100, unit: 'kg', reorderLevel: 10 }, 201);
    const ration = await api('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'morning', timeOfDay: '06:30', items: [{ inventoryItem: oats._id, amount: 2 }] }, 201);
    assert.equal((await raw('trainer', 'PUT', `/feeding/${ration._id}`, { horse: foreign._id })).status, 403);
    assert.equal((await raw('trainer', 'PUT', `/feeding/${ration._id}`, { $set: { horse: foreign._id } })).status, 400);
    assert.equal(String((await models.FeedingSchedule.findById(ration._id)).horse), String(horse._id));
  });

  await t.test('archiving only goes through its own flow', async () => {
    const { horse } = await intake(ctx, 'TEST not archived by PUT');
    await api('manager', 'PUT', `/horses/${horse._id}`, { isArchived: true, archivedReason: 'PUT' });
    const after = await models.Horse.findById(horse._id);
    assert.equal(after.isArchived, false, 'PUT /horses/:id does not archive');
    assert.equal(await models.StableAssignment.countDocuments({ horse: horse._id }), 1, 'its stall is still its own');
  });

  await t.test('a race with a result keeps its horse, name, day and distance', async () => {
    const { horse } = await intake(ctx, 'TEST race winner');
    const race = await api('trainer', 'POST', '/races', { horse: horse._id, raceName: 'TEST Guard Cup', raceDate: day().toISOString(), distance: 1600 }, 201);
    await api('trainer', 'PATCH', `/races/${race._id}/results`, { position: 1, prizeMoney: 1000 });
    const other = await api('manager', 'POST', '/horses', { name: 'TEST swapped in', owner: users.owner.id, assignedTrainer: users.trainer.id }, 201);

    const swapped = await raw('trainer', 'PUT', `/races/${race._id}`, { horse: other._id });
    assert.equal(swapped.status, 409);
    assert.match(swapped.body.message, /đã có kết quả/);
    assert.equal((await raw('trainer', 'PUT', `/races/${race._id}`, { raceName: 'TEST Renamed Cup' })).status, 409);
    // The venue is not what the prize was booked on; it can still be filled in.
    await api('trainer', 'PUT', `/races/${race._id}`, { venue: 'TEST trường đua', horse: horse._id, raceName: 'TEST Guard Cup' });

    const entry = await models.RaceEntry.findById(race._id);
    const prize = await models.FinancialRecord.findOne({ raceEntry: race._id });
    assert.equal(String(entry.horse), String(horse._id));
    assert.equal(String(prize.horse), String(horse._id), 'the prize stays with the horse that ran');
    assert.equal((await models.Horse.findById(other._id)).achievements.length, 0);
  });

  await t.test('a horse with money on the books is archived, not deleted', async () => {
    const horse = await api('manager', 'POST', '/horses', { name: 'TEST horse with a ledger', owner: users.owner.id }, 201);
    await api('manager', 'POST', '/finance', { horse: horse._id, type: 'cost', category: 'other', amount: 2500, date: day().toISOString(), note: 'TEST retained ledger' }, 201);
    const refused = await raw('manager', 'DELETE', `/horses/${horse._id}`);
    assert.equal(refused.status, 409);
    assert.match(refused.body.message, /1 khoản thu chi/);
    assert.equal(refused.body.data?.canArchive, true);
    assert.ok(await models.Horse.exists({ _id: horse._id }));

    // A horse entered by mistake, with nothing on record, can still be deleted.
    const mistake = await api('manager', 'POST', '/horses', { name: 'TEST entered by mistake' }, 201);
    await api('manager', 'DELETE', `/horses/${mistake._id}`);
    assert.equal(await models.Horse.exists({ _id: mistake._id }), null);
  });

  await t.test('a stall left without a groom, then given one: the horse’s work goes to the new groom', async () => {
    const { created } = await api('manager', 'POST', '/stable/stalls/generate', { zone: 'W', count: 1 }, 201);
    const stall = created[0];
    const { horse } = await intake(ctx, 'TEST handed over');
    await api('manager', 'POST', '/stable/assignments', { horse: horse._id, stall: stall._id, assignedCaretaker: users.groom.id }, 201);
    const task = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'icing', source: 'system', scheduledDate: new Date(), trainingSession: new mongoose.Types.ObjectId() });

    await api('manager', 'PUT', `/stable/stalls/${stall._id}/caretaker`, { caretaker: null });
    const replacement = await models.User.create({ name: 'TEST groom handover', email: 'groom-handover@integration.test', passwordHash: 'not-used', role: 'groom' });
    await api('manager', 'PUT', `/stable/stalls/${stall._id}/caretaker`, { caretaker: replacement.id });

    assert.equal(String((await models.StableAssignment.findOne({ horse: horse._id })).assignedCaretaker), replacement.id);
    assert.equal(String((await models.DailyTask.findById(task._id)).assignedTo), replacement.id, 'the pending work follows the horse to its new groom');
  });

  // Last: it locks the trainer's account.
  await t.test('a horse whose trainer’s account is locked needs a new trainer on its checklist', async () => {
    const { horse } = await intake(ctx, 'TEST trainer locked');
    const item = async () => (await api('manager', 'GET', `/horses/${horse._id}/checklist`)).items.find((i) => i.key === 'trainer');
    assert.equal((await item()).done, true);
    await api('manager', 'PUT', `/users/${users.trainer.id}`, { isActive: false });
    const locked = await item();
    assert.equal(locked.done, false);
    assert.match(locked.detail, /bị khóa, cần người thay/);
    const queueRow = (await api('manager', 'GET', '/horses/checklist')).find((row) => String(row.horse._id) === String(horse._id));
    assert.equal(queueRow.items.find((i) => i.key === 'trainer').done, false, "the Manager's queue counts the horse");
  });
});
