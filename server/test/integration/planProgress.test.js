const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake, planFor } = require('../../test-support/integration');

const DAY = 86400000;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

test('a plan follows its horse: paused while stopped, the days made up, a checkpoint at each phase end, withdrawn when it cannot be ready', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('planprogress');
  t.after(() => ctx.close());
  const { api, models, users } = ctx;
  const { followPlan } = require('../../src/modules/training/planProgress.service');
  const exam = (horse, resultStatus, extra = {}) =>
    api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: `TEST ${resultStatus}`, resultStatus, vitalSigns: { temperatureC: 37.9, heartRate: 38 }, ...extra }, 201);

  // Two weeks of base, two of strength, two of speed, a week of taper ending on race day, a week of recovery.
  const { horse } = await intake(ctx, 'TEST Progress Horse');
  const raceDay = new Date(startOfToday().getTime() + 48 * DAY + 12 * 3600000);
  const race = await api('trainer', 'POST', '/races', { horse: horse._id, raceName: 'TEST Progress Cup', raceDate: raceDay.toISOString(), distance: 1600, surface: 'dirt' }, 201);
  const phases = [
    { key: 'base_building', weeks: 2, intensity: 'moderate' },
    { key: 'strength', weeks: 2, intensity: 'high' },
    { key: 'speed', weeks: 2, intensity: 'high' },
    { key: 'peak', weeks: 1, intensity: 'moderate' },
    { key: 'recovery', weeks: 1, intensity: 'light' },
  ].map((p) => ({ ...p, distanceTarget: 1600, surface: 'dirt', week: [] }));
  const plan = await planFor(ctx, horse, { targetRace: race._id, phases });
  const load = () => models.TrainingPlan.findById(plan._id);
  const extra = async () => (await load()).phases.map((p) => p.extraDays || 0);

  // Too early for the trainer's checkpoint: a phase is judged in its last days.
  await api('trainer', 'POST', `/training/plans/${plan._id}/checkpoint`, { decision: 'pass' }, 409);

  // Injured: the plan pauses in base building.
  await exam(horse, 'injured');
  const paused = await load();
  assert.equal(paused.pause.phaseIndex, 0);
  assert.ok(await models.Notification.exists({ horse: horse._id, type: 'plan_checkpoint', message: /tạm dừng ở giai đoạn Nền tảng/ }));

  // Ten days later the vet clears it: base runs ten days longer, speed gives seven to keep the race.
  await models.TrainingPlan.updateOne({ _id: plan._id }, { 'pause.since': new Date(Date.now() - 10 * DAY) });
  await exam(horse, 'eligible', { clearedLevel: 'high' });
  const resumed = await load();
  assert.equal(resumed.pause, null);
  assert.equal(resumed.pauses.length, 1);
  assert.equal(resumed.pauses[0].days, 10);
  assert.deepEqual(await extra(), [10, 0, -7, 0, 0]);
  assert.equal((await models.RaceEntry.findById(race._id)).status, 'registered', 'still in time for the race');
  assert.ok(await models.Notification.exists({ horse: horse._id, type: 'plan_checkpoint', message: /tập lại sau 10 ngày nghỉ.*kéo dài thêm 10 ngày.*Rút ngắn Tốc độ 7 ngày/ }));

  // The end of base building: most of its sessions missed — it runs a week more, strength gives the days.
  const baseEnd = (await load()).phases[0].endDate;
  const inBase = (n) => new Date(baseEnd.getTime() - n * DAY);
  await models.TrainingSession.insertMany(
    [5, 4, 3, 2].map((n) => ({ trainingPlan: plan._id, horse: horse._id, kind: 'canter', scheduledAt: inBase(n), status: 'missed', generated: true }))
      .concat([{ trainingPlan: plan._id, horse: horse._id, kind: 'canter', scheduledAt: inBase(6), status: 'evaluated', generated: true }])
  );
  const firstCheck = await followPlan(await load(), { now: new Date(baseEnd.getTime() + 3600000) });
  assert.equal(firstCheck.result, 'extended');
  assert.deepEqual(await extra(), [17, -7, -7, 0, 0]);
  const checked = await load();
  assert.equal(checked.checkpoints[0].result, 'extended');
  assert.match(checked.checkpoints[0].reasons.join(' '), /chuyên cần 1\/5 buổi/);
  assert.ok(await models.Notification.exists({ horse: horse._id, type: 'plan_checkpoint', message: /chưa đạt đánh giá cuối giai đoạn Nền tảng/ }));

  // Still not there a week later: nothing left to cut — the horse is withdrawn from its race, everyone told.
  const secondEnd = checked.phases[0].endDate;
  const secondCheck = await followPlan(await load(), { now: new Date(secondEnd.getTime() + 3600000) });
  assert.equal(secondCheck.result, 'extended');
  assert.equal(secondCheck.withdrawn, true);
  const entry = await models.RaceEntry.findById(race._id);
  assert.equal(entry.status, 'withdrawn');
  assert.equal(entry.decision.auto, true);
  assert.match(entry.decision.reason, /thiếu \d+ ngày/);
  for (const who of [{ recipientUser: users.trainer.id }, { recipientUser: users.owner.id }, { recipientRole: 'manager' }]) {
    assert.ok(await models.Notification.exists({ ...who, horse: horse._id, type: 'race_decision', message: /rút khỏi TEST Progress Cup/ }), JSON.stringify(who));
  }

  // A third miss: the phase has failed; there is no race left to withdraw from.
  const thirdEnd = (await load()).phases[0].endDate;
  const third = await followPlan(await load(), { now: new Date(thirdEnd.getTime() + 3600000) });
  assert.equal(third.result, 'failed');

  // A horse stopped long enough that it cannot be ready, even back at work tomorrow: withdrawn while still stopped.
  const { horse: long } = await intake(ctx, 'TEST Long Stop Horse');
  const longRace = await api('trainer', 'POST', '/races', { horse: long._id, raceName: 'TEST Long Cup', raceDate: raceDay.toISOString(), distance: 1600, surface: 'dirt' }, 201);
  const longPlan = await planFor(ctx, long, { targetRace: longRace._id, phases });
  await exam(long, 'injured');
  assert.ok((await models.TrainingPlan.findById(longPlan._id)).pause);
  assert.equal((await models.RaceEntry.findById(longRace._id)).status, 'registered', 'just stopped: still time');
  await models.TrainingPlan.updateOne({ _id: longPlan._id }, { 'pause.since': new Date(Date.now() - 20 * DAY) });
  const still = await followPlan(await models.TrainingPlan.findById(longPlan._id));
  assert.equal(still.withdrawn, true);
  assert.equal((await models.RaceEntry.findById(longRace._id)).status, 'withdrawn');

  // The plan page shows where the current phase stands for its checkpoint.
  const view = await api('trainer', 'GET', `/training/plans/${plan._id}`);
  assert.ok(view.progress.checkpoint === null || Array.isArray(view.progress.checkpoint.checks));
});
