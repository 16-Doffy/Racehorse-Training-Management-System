const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, day } = require('../../test-support/integration');

// n minutes from now, but still today: a session tomorrow has no meals to judge yet, so a run just
// before midnight would otherwise test nothing.
const laterToday = (n) => new Date(Math.min(Date.now() + n * 60000, day(1).getTime() - 1000));

// A missed meal is not just a red label: the trainer is told, harder work waits until the horse has
// eaten, and the trainer can ask the groom to feed it now. Rations sit in their part of the day, far
// enough apart, and the trainer can delete one.
test('meals: ration times, missed meals, hard work on an empty stomach, make-up, delete', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('meals');
  t.after(() => ctx.close());
  const { api, raw, users, models } = ctx;
  const { horse } = await intake(ctx, 'TEST Meals Horse');
  const oats = await api('manager', 'POST', '/inventory', { name: 'TEST oats meal', category: 'feed', unit: 'kg', quantity: 50 }, 201);
  const line = [{ inventoryItem: oats._id, amount: 2 }];
  let morning;

  await t.test('a ration sits in its part of the day and at least 3 hours from the others', async () => {
    const lunchAtNight = await raw('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'noon', timeOfDay: '23:00', items: line });
    assert.equal(lunchAtNight.status, 400);
    assert.match(lunchAtNight.body.message, /Bữa trưa phải từ 11:00 đến 15:59/);
    assert.equal((await raw('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'evening', timeOfDay: '07:00', items: line })).status, 400);
    morning = await api('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'morning', timeOfDay: '06:00', items: line }, 201);
    await api('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'evening', timeOfDay: '17:00', items: line }, 201);
    const tooClose = await raw('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'noon', timeOfDay: '15:30', items: line });
    assert.equal(tooClose.status, 400);
    assert.match(tooClose.body.message, /quá gần bữa chiều 17:00 .* ít nhất 3 giờ/);
    assert.equal((await raw('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'morning', timeOfDay: '07:00', items: line })).status, 409, 'one ration per meal');
    const moved = await raw('trainer', 'PUT', `/feeding/${morning._id}`, { timeOfDay: '14:00' });
    assert.equal(moved.status, 400, 'moving breakfast into the afternoon is refused too');
  });

  await t.test('B: a meal whose window closed unrecorded tells the trainer and the groom once', async () => {
    const { notifyMissedMeals } = require('../../src/modules/stable/missedCare.service');
    const yesterday = day(-1);
    yesterday.setHours(6, 0, 0, 0);
    const missed = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: 'morning', scheduledDate: yesterday });
    const generic = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: null, scheduledDate: yesterday });
    assert.ok((await notifyMissedMeals()) >= 1);
    const toTrainer = await models.Notification.find({ type: 'meal_missed', recipientUser: users.trainer.id, message: /TEST Meals Horse: bữa sáng \(06:00/ });
    assert.equal(toTrainer.length, 1);
    assert.equal(await models.Notification.countDocuments({ type: 'meal_missed', recipientUser: users.groom.id, message: /TEST Meals Horse/ }), 1);
    assert.equal(await notifyMissedMeals(), 0, 'told once');
    assert.equal((await models.DailyTask.findById(generic._id)).missedNotifiedAt, null, 'the no-ration task is reported by the groom instead');
    assert.ok((await models.DailyTask.findById(missed._id)).missedNotifiedAt);
  });

  await t.test('C + make-up: a horse that may not have eaten gets no hard work until it is fed', async () => {
    const { computeReadiness } = require('../../src/modules/training/readiness.service');
    // Earlier meals were not given: the last meal before the session was reported not done today.
    await models.DailyTask.deleteMany({ horse: horse._id, taskType: 'feeding' });
    const today = day();
    today.setMinutes(1);
    const skipped = await models.DailyTask.create({
      horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: 'morning',
      scheduledDate: today, status: 'skipped', skipReason: 'TEST hết cám',
    });
    const at = laterToday(15);
    const hard = (await computeReadiness(horse._id, { scheduledAt: at, intensity: 'high' })).gates.find((g) => g.key === 'nutrition');
    assert.equal(hard.status, 'blocked', hard.detail);
    assert.match(hard.detail, /nhân viên báo không cho ăn được \(TEST hết cám\)/);
    assert.equal(hard.action, 'make_up_meal');
    assert.equal(String(hard.taskId), String(skipped._id));
    const light = (await computeReadiness(horse._id, { scheduledAt: at, intensity: 'light' })).gates.find((g) => g.key === 'nutrition');
    assert.equal(light.status, 'caution', 'light work only warns');

    const makeUp = await api('trainer', 'POST', `/stable/tasks/${skipped._id}/make-up`, undefined, 201);
    assert.equal(String(makeUp.makeUpOf), String(skipped._id));
    assert.equal(makeUp.mealSlot, 'morning');
    assert.equal(makeUp.supplies[0].amount, 2, 'from the ration as it stands');
    assert.ok(await models.Notification.exists({ recipientUser: users.groom.id, message: /yêu cầu cho ăn bù bữa sáng/ }));
    assert.equal((await raw('trainer', 'POST', `/stable/tasks/${skipped._id}/make-up`)).status, 409, 'once per missed meal');
    // A meal reported "can't feed" before its hour is scheduled after its make-up; the groom's list
    // still puts the make-up first, so the app (one task per meal) shows the one still to do.
    await models.DailyTask.updateOne({ _id: skipped._id }, { $set: { scheduledDate: laterToday(60) } });
    const list = (await api('groom', 'GET', `/stable/tasks?horse=${horse._id}`)).map((task) => String(task._id));
    assert.ok(list.indexOf(String(makeUp._id)) < list.indexOf(String(skipped._id)), 'make-up listed before the meal it replaces');
    await models.DailyTask.updateOne({ _id: skipped._id }, { $set: { scheduledDate: today } });
    await api('groom', 'PATCH', `/stable/tasks/${makeUp._id}/complete`, { clientOpId: 'make-up-1' });
    const after = (await computeReadiness(horse._id, { scheduledAt: at, intensity: 'high' })).gates.find((g) => g.key === 'nutrition');
    assert.doesNotMatch(after.detail, /không cho ăn được/, 'the make-up counts as the meal');
    assert.match(after.detail, /cho ăn lúc/, 'the digestion wait now starts from the make-up');
    const notToday = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: 'evening', scheduledDate: day(-1), status: 'skipped', skipReason: 'x' });
    assert.equal((await raw('trainer', 'POST', `/stable/tasks/${notToday._id}/make-up`)).status, 409, 'only today\'s meals');
  });

  await t.test('a meal given ahead of its hour counts from when it was eaten', async () => {
    const { computeReadiness } = require('../../src/modules/training/readiness.service');
    await models.DailyTask.deleteMany({ horse: horse._id, taskType: 'feeding' });
    const ago = (n) => new Date(Date.now() - n * 60000);
    const meal = { horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', status: 'completed' };
    await models.DailyTask.create({ ...meal, mealSlot: 'morning', scheduledDate: ago(13 * 60), completedAt: ago(13 * 60) });
    // Planned for after the session, given two minutes ago: the horse has a full stomach, not an empty one.
    await models.DailyTask.create({ ...meal, mealSlot: 'evening', scheduledDate: laterToday(20), completedAt: ago(2) });
    const nutrition = async (scheduledAt, intensity = 'high') => (await computeReadiness(horse._id, { scheduledAt, intensity })).gates.find((g) => g.key === 'nutrition');
    const gate = await nutrition(laterToday(1));
    assert.doesNotMatch(gate.detail, /đói/, gate.detail);
    assert.equal(gate.status, 'blocked', gate.detail);
    assert.match(gate.detail, /Bữa chiều cho ăn lúc .*, mới \d+ phút trước giờ tập/);

    // Hay eaten after grain does not shorten the grain's digestion.
    await models.DailyTask.deleteMany({ horse: horse._id, taskType: 'feeding' });
    await models.DailyTask.create({ ...meal, source: 'trainer', mealSlot: 'morning', scheduledDate: ago(20), completedAt: ago(20), supplies: [{ name: 'TEST oats', amount: 2 }] });
    await models.DailyTask.create({ ...meal, mealSlot: 'evening', scheduledDate: laterToday(20), completedAt: ago(2), supplies: [{ name: 'Cỏ khô Timothy', amount: 1 }] });
    const grain = await nutrition(laterToday(1));
    assert.equal(grain.status, 'blocked', grain.detail);
    assert.match(grain.detail, /Bữa sáng cho ăn lúc .*, mới 2\d phút trước giờ tập/);
    assert.equal((await nutrition(laterToday(1), 'light')).status, 'caution', 'light work only warns');

    // A meal planned just over 24 hours before the session but eaten inside them is still seen.
    await models.DailyTask.deleteMany({ horse: horse._id, taskType: 'feeding' });
    const at = laterToday(1);
    await models.DailyTask.create({ ...meal, mealSlot: 'morning', scheduledDate: new Date(at.getTime() - 24 * 3600000 - 1), completedAt: new Date(at.getTime() - 23 * 3600000) });
    const old = await nutrition(at);
    assert.doesNotMatch(old.detail, /Không có bữa ăn nào/, old.detail);
    assert.match(old.detail, /có thể đã đói/);
  });

  await t.test('a feed has the kind the Manager gives it; supplements alone are not a meal', async () => {
    const { computeReadiness } = require('../../src/modules/training/readiness.service');
    const item = (body, expected = 201) => api('manager', 'POST', '/inventory', { category: 'feed', unit: 'kg', quantity: 50, ...body }, expected);
    assert.equal((await item({ name: 'TEST Cỏ khô loại 1' })).feedType, 'forage', 'guessed from the name when left out');
    assert.equal((await item({ name: 'TEST Cám hỗn hợp' })).feedType, 'concentrate');
    const greens = await item({ name: 'TEST Bó xanh', feedType: 'forage' });
    const oil = await item({ name: 'TEST Flaxseed', unit: 'lít', feedType: 'supplement' });
    assert.equal(greens.feedType, 'forage', 'the Manager’s choice over the name');
    assert.equal((await raw('manager', 'POST', '/inventory', { name: 'TEST x', category: 'feed', unit: 'kg', feedType: 'grain' })).status, 400);
    assert.equal((await raw('manager', 'POST', '/inventory', { name: 'TEST y', category: 'medicine', unit: 'viên', feedType: 'forage' })).status, 400);
    const fixed = await api('manager', 'PUT', `/inventory/${greens._id}`, { feedType: 'concentrate' });
    assert.equal(fixed.feedType, 'concentrate');
    await api('manager', 'PUT', `/inventory/${greens._id}`, { feedType: 'forage' });

    const ago = (n) => new Date(Date.now() - n * 60000);
    const meal = { horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', status: 'completed' };
    const line = (stock, amount = 1) => [{ inventoryItem: stock._id, name: stock.name, amount }];
    const nutrition = async (intensity = 'high') => (await computeReadiness(horse._id, { scheduledAt: laterToday(1), intensity })).gates.find((g) => g.key === 'nutrition');

    // Hay by the Manager's word, eaten two minutes ago: a warning, not the grain block its name would get.
    await models.DailyTask.deleteMany({ horse: horse._id, taskType: 'feeding' });
    await models.DailyTask.create({ ...meal, mealSlot: 'evening', scheduledDate: ago(2), completedAt: ago(2), supplies: line(greens, 2) });
    const hay = await nutrition();
    assert.equal(hay.status, 'caution', hay.detail);
    assert.match(hay.detail, /chỉ cỏ khô/);

    // Oil alone two minutes ago, the last real meal seven hours ago: no digestion wait, and still hungry.
    await models.DailyTask.deleteMany({ horse: horse._id, taskType: 'feeding' });
    await models.DailyTask.create({ ...meal, mealSlot: 'morning', scheduledDate: ago(7 * 60), completedAt: ago(7 * 60), supplies: line(oats, 2) });
    await models.DailyTask.create({ ...meal, mealSlot: 'evening', scheduledDate: ago(2), completedAt: ago(2), supplies: line(oil, 0.1) });
    const oilOnly = await nutrition();
    assert.notEqual(oilOnly.status, 'blocked', oilOnly.detail);
    assert.match(oilOnly.detail, /Bữa sáng cho ăn lúc .*có thể đã đói/);

    // Oil was all the horse had: no meal in 24 hours, said as a fed supplement (the ration is the problem).
    await models.DailyTask.deleteMany({ horse: horse._id, taskType: 'feeding', mealSlot: 'morning' });
    const onlyOil = await nutrition();
    assert.equal(onlyOil.status, 'blocked', onlyOil.detail);
    assert.match(onlyOil.detail, /Bữa chiều \(\d\d:\d\d\) chỉ có thức ăn bổ sung \(TEST Flaxseed\) — không tính là một bữa ăn/);
    assert.match(onlyOil.detail, /Lập khẩu phần có cỏ hoặc thức ăn tinh/);
  });

  await t.test('a meal missed earlier today and not made up is a warning, even after a later meal', async () => {
    const { computeReadiness } = require('../../src/modules/training/readiness.service');
    await models.DailyTask.deleteMany({ horse: horse._id, taskType: 'feeding' });
    const hay = await api('manager', 'POST', '/inventory', { name: 'TEST cỏ trưa', category: 'feed', unit: 'kg', quantity: 20 }, 201);
    const base = { horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system' };
    const missedAt = new Date(Math.max(day().getTime(), Date.now() - 3 * 3600000));
    const skipped = await models.DailyTask.create({ ...base, mealSlot: 'morning', scheduledDate: missedAt, status: 'skipped', skipReason: 'TEST hết cám' });
    const fedAt = new Date(Math.max(missedAt.getTime() + 60000, Date.now() - 90 * 60000));
    await models.DailyTask.create({ ...base, mealSlot: 'noon', scheduledDate: fedAt, status: 'completed', completedAt: fedAt, supplies: [{ inventoryItem: hay._id, name: hay.name, amount: 2 }] });
    const nutrition = async (intensity = 'high') => (await computeReadiness(horse._id, { scheduledAt: laterToday(1), intensity })).gates.find((g) => g.key === 'nutrition');

    const short = await nutrition();
    assert.equal(short.status, 'caution', short.detail);
    assert.match(short.detail, /Hôm nay bữa sáng \(.*\) nhân viên báo không cho ăn được \(TEST hết cám\) và chưa được ăn bù/);
    assert.equal(short.action, 'make_up_meal');
    assert.equal(String(short.taskId), String(skipped._id));

    // Asked for, not given yet: still short, and no second make-up button.
    const makeUp = await api('trainer', 'POST', `/stable/tasks/${skipped._id}/make-up`, undefined, 201);
    const waiting = await nutrition();
    assert.equal(waiting.status, 'caution', waiting.detail);
    assert.match(waiting.detail, /đã báo cho ăn bù, đang chờ nhân viên/);
    assert.equal(waiting.action, undefined);

    await api('groom', 'PATCH', `/stable/tasks/${makeUp._id}/complete`, { clientOpId: 'short-make-up' });
    const fed = await nutrition('light');
    assert.doesNotMatch(fed.detail, /ăn thiếu/, fed.detail);
    assert.match(fed.detail, /mới \d+ phút trước giờ tập/, 'the digestion wait starts from the make-up');
  });

  await t.test('the trainer deletes a ration; today\'s meal not given yet goes with it, history stays', async () => {
    const upcoming = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: 'morning', scheduledDate: new Date(Date.now() + 30 * 60000) });
    const given = await models.DailyTask.create({ horse: horse._id, assignedTo: users.groom.id, taskType: 'feeding', source: 'system', mealSlot: 'morning', scheduledDate: new Date(), status: 'completed', completedAt: new Date() });
    const res = await api('trainer', 'DELETE', `/feeding/${morning._id}`);
    assert.equal(res.removedTasks, 1);
    assert.equal(await models.FeedingSchedule.exists({ _id: morning._id }), null);
    assert.equal(await models.DailyTask.exists({ _id: upcoming._id }), null);
    assert.ok(await models.DailyTask.exists({ _id: given._id }), 'what was given stays');
    assert.equal((await raw('owner', 'DELETE', `/feeding/${morning._id}`)).status, 403);
  });
});
