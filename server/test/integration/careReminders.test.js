const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake } = require('../../test-support/integration');

const DAY = 24 * 60 * 60 * 1000;
const at = (days, hour = 9) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

// Who hears of a care date and when; care done (an exam, a vaccination) ends the reminder it answered.
test('care reminders reach the vet, the trainer and the owner once, and end when the care is done', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('carereminders');
  t.after(() => ctx.close());
  const { api, models, users } = ctx;
  const { checkCare } = require('../../src/realtime/careScheduler');
  const { horse } = await intake(ctx, 'TEST Nhắc Lịch');
  const told = (user, type) => models.Notification.countDocuments({ horse: horse._id, recipientUser: user.id, type });
  const due = async () => (await models.Horse.findById(horse._id).lean()).careSchedule;

  // A vaccination in two days and a follow-up exam that falls due today.
  const vaccineDay = at(2);
  const examDay = new Date();
  examDay.setHours(0, 1, 0, 0);
  await api('vet', 'PATCH', `/horses/${horse._id}/care-schedule`, { nextVaccinationDue: vaccineDay.toISOString(), nextExamDue: examDay.toISOString() });

  await checkCare();
  assert.equal(await told(users.owner, 'vaccination_due'), 1, 'the owner hears of the vaccination two days ahead');
  assert.equal(await told(users.owner, 'exam_due'), 1, 'and of the follow-up exam today');
  assert.equal(await told(users.vet, 'exam_due'), 1, 'the vet is reminded of the exam due');
  assert.equal(await told(users.vet, 'vaccination_due'), 0, 'not yet of the vaccination');
  assert.equal(await told(users.trainer, 'exam_due'), 1, 'the trainer hears the follow-up exam is due');

  // The next check the same day repeats nothing.
  await checkCare();
  assert.equal(await told(users.owner, 'vaccination_due'), 1);
  assert.equal(await told(users.trainer, 'exam_due'), 1);
  assert.equal(await told(users.vet, 'exam_due'), 1);

  // A day later the vet is reminded again of the exam still due; the trainer and the owner are not.
  await checkCare(new Date(Date.now() + DAY + 60 * 1000));
  assert.equal(await told(users.vet, 'exam_due'), 2);
  assert.equal(await told(users.trainer, 'exam_due'), 1);
  assert.equal(await told(users.owner, 'exam_due'), 1);

  // The follow-up exam filed without a new date ends that reminder.
  await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST tái khám ổn', resultStatus: 'eligible', clearedLevel: 'high', vitalSigns: { temperatureC: 37.8, heartRate: 38 } }, 201);
  assert.equal((await due()).nextExamDue, null, 'the exam that was due is done');

  // An exam booking a new follow-up sets it; a later exam does not answer a check booked weeks away.
  const followUp = at(10);
  await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST theo dõi', resultStatus: 'monitoring', vitalSigns: { temperatureC: 38.1, heartRate: 40 }, followUpAt: followUp.toISOString() }, 201);
  assert.equal(new Date((await due()).nextExamDue).getTime(), followUp.getTime());
  await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST khám thêm', resultStatus: 'monitoring', vitalSigns: { temperatureC: 38, heartRate: 39 } }, 201);
  assert.equal(new Date((await due()).nextExamDue).getTime(), followUp.getTime(), 'a check ten days away stays');

  // The vaccination recorded with no next date ends its reminder; recorded with one, it moves.
  await api('vet', 'POST', `/horses/${horse._id}/care-events`, { kind: 'vaccination', date: at(0).toISOString(), product: 'TEST Flu vaccine' }, 201);
  assert.equal((await due()).nextVaccinationDue, null, 'the vaccination due in two days is done');
  const farrierNext = at(40);
  await api('vet', 'PATCH', `/horses/${horse._id}/care-schedule`, { nextFarrierDue: at(-1).toISOString() });
  await api('vet', 'POST', `/horses/${horse._id}/care-events`, { kind: 'farrier', date: at(0).toISOString(), nextDue: farrierNext.toISOString() }, 201);
  assert.equal(new Date((await due()).nextFarrierDue).getTime(), farrierNext.getTime());
  // A deworming far ahead is not answered by one done today.
  const dewormLater = at(60);
  await api('vet', 'PATCH', `/horses/${horse._id}/care-schedule`, { nextDewormingDue: dewormLater.toISOString() });
  await api('vet', 'POST', `/horses/${horse._id}/care-events`, { kind: 'deworming', date: at(0).toISOString(), product: 'TEST Ivermectin' }, 201);
  assert.equal(new Date((await due()).nextDewormingDue).getTime(), dewormLater.getTime());

  // A date the vet moves is a new reminder for the owner.
  await api('vet', 'PATCH', `/horses/${horse._id}/care-schedule`, { nextVaccinationDue: at(1).toISOString() });
  await checkCare();
  assert.equal(await told(users.owner, 'vaccination_due'), 2);
});
