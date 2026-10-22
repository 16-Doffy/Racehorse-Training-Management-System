const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { startIntegration, intake, day } = require('../../test-support/integration');

// The APIs teammates asked for (15/10): audit filters, horse papers and valuation, the owner's
// dashboard numbers, routine care history, and exam requests a vet can take on or decline.
test('team requests: audit filters, horse papers, owner numbers, care history, exam requests', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('team');
  t.after(() => ctx.close());
  const { api, raw, users, models } = ctx;
  const { horse } = await intake(ctx, 'TEST Papers Horse');

  await t.test('audit log filters by person, action family and dates; facets for the pickers', async () => {
    const all = await api('manager', 'GET', '/audit-logs');
    assert.ok(all.total > 0);
    const horseFamily = await api('manager', 'GET', '/audit-logs?action=horse.');
    assert.ok(horseFamily.items.length > 0);
    assert.ok(horseFamily.items.every((l) => l.action.startsWith('horse.')));
    const byVet = await api('manager', 'GET', `/audit-logs?actor=${users.vet.id}`);
    assert.ok(byVet.items.every((l) => String(l.actor._id) === String(users.vet.id)));
    assert.equal((await api('manager', 'GET', `/audit-logs?from=${day(2).toISOString()}`)).total, 0);
    assert.equal((await raw('manager', 'GET', '/audit-logs?actor=nope')).status, 400);
    assert.equal((await raw('manager', 'GET', '/audit-logs?from=2026-13-45')).status, 400);
    assert.equal((await raw('trainer', 'GET', '/audit-logs')).status, 403);
    const facets = await api('manager', 'GET', '/audit-logs/facets');
    assert.ok(facets.actions.includes('horse.create'));
    assert.ok(facets.targetModels.includes('Horse'));
    assert.ok(facets.actors.some((u) => String(u._id) === String(users.manager.id)));
  });

  await t.test('horse papers: sex, microchip, registration; valuation only for the manager and the owner', async () => {
    const updated = await api('manager', 'PUT', `/horses/${horse._id}`, { sex: 'mare', microchipNumber: '985141002345678', registrationNumber: 'VN-2022-001', valuationVnd: 500000000 });
    assert.equal(updated.sex, 'mare');
    assert.equal(updated.valuationVnd, 500000000);
    assert.ok(updated.valuationUpdatedAt);
    const twin = await api('manager', 'POST', '/horses', { name: 'TEST Chip Twin', owner: users.owner.id }, 201);
    const duplicate = await raw('manager', 'PUT', `/horses/${twin._id}`, { microchipNumber: '985141002345678' });
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.body.message, /vi mạch/);
    assert.equal((await raw('manager', 'PUT', `/horses/${twin._id}`, { microchipNumber: '12-ab' })).status, 400);
    const asTrainer = await api('trainer', 'GET', `/horses/${horse._id}`);
    assert.equal(asTrainer.sex, 'mare');
    assert.equal(asTrainer.valuationVnd, undefined, 'a trainer does not see what the horse is worth');
    assert.ok((await api('trainer', 'GET', '/horses')).every((h) => !('valuationVnd' in h)));
    assert.equal((await api('owner', 'GET', `/horses/${horse._id}`)).valuationVnd, 500000000);
    const cleared = await api('manager', 'PUT', `/horses/${horse._id}`, { registrationNumber: '' });
    assert.equal(cleared.registrationNumber, undefined, 'a blank field removes the value');
  });

  await t.test("owner's dashboard: race record, valuation, money and training; the chart by day", async () => {
    await models.RaceEntry.create([
      { horse: horse._id, registeredBy: users.trainer.id, raceName: 'TEST Cup A', raceDate: day(-20), status: 'completed', position: 1, prizeMoney: 10000000 },
      { horse: horse._id, registeredBy: users.trainer.id, raceName: 'TEST Cup B', raceDate: day(-10), status: 'completed', position: 4 },
    ]);
    const overview = await api('owner', 'GET', '/horses/owner-overview');
    assert.equal(overview.horses, 2);
    assert.deepEqual(overview.races, { completed: 2, wins: 1, podiums: 1, prize: 10000000, winRate: 50 });
    assert.deepEqual(overview.valuation, { total: 500000000, valued: 1 });
    assert.ok(overview.money.thisMonth && overview.money.lastMonth);
    assert.equal(typeof overview.training.thisMonth, 'number');
    const summary = await api('owner', 'GET', '/horses/owner-summary');
    const mine = summary.find((s) => String(s.horse._id) === String(horse._id));
    assert.deepEqual(mine.raceStats, { completed: 2, wins: 1, podiums: 1, prize: 10000000 });
    assert.equal(mine.horse.valuationVnd, 500000000);
    assert.equal((await raw('trainer', 'GET', '/horses/owner-overview')).status, 403);
    const byDay = await api('owner', 'GET', '/reports/training-chart?days=30');
    assert.equal(byDay.granularity, 'day');
    assert.equal(byDay.months.length, 30);
    assert.match(byDay.months[29], /^\d{4}-\d{2}-\d{2}$/);
    assert.equal((await raw('owner', 'GET', '/reports/training-chart?days=3')).status, 400);
    assert.equal((await api('owner', 'GET', '/reports/training-chart?months=6')).granularity, 'month');
  });

  await t.test('care history: a vaccination moves the reminder; mistakes are undone within a day', async () => {
    const due = day(180);
    const shot = await api('vet', 'POST', `/horses/${horse._id}/care-events`, { kind: 'vaccination', date: day(0).toISOString(), product: 'TEST Flu vaccine', batchNumber: 'LOT-42', dose: '1 ml', nextDue: due.toISOString() }, 201);
    const after = await models.Horse.findById(horse._id);
    assert.equal(after.careSchedule.nextVaccinationDue.getTime(), due.getTime());
    assert.equal(after.careSchedule.vaccinationNotifiedAt, null);
    assert.equal((await raw('vet', 'POST', `/horses/${horse._id}/care-events`, { kind: 'vaccination', date: day(0).toISOString() })).status, 400, 'a vaccine must be named');
    assert.equal((await raw('vet', 'POST', `/horses/${horse._id}/care-events`, { kind: 'farrier', date: day(3).toISOString() })).status, 400, 'care done, not planned');
    assert.equal((await raw('trainer', 'POST', `/horses/${horse._id}/care-events`, { kind: 'farrier', date: day(0).toISOString() })).status, 403);
    const list = await api('trainer', 'GET', `/horses/${horse._id}/care-events`);
    assert.equal(list.length, 1);
    assert.equal(list[0].performedBy.name, 'TEST vet');
    const timeline = await api('trainer', 'GET', `/horses/${horse._id}/timeline`);
    assert.ok(timeline.events.some((e) => e.kind === 'routine_care' && /TEST Flu vaccine/.test(e.title)));
    await models.CareEvent.collection.updateOne({ _id: new mongoose.Types.ObjectId(shot._id) }, { $set: { createdAt: new Date(Date.now() - 25 * 3600000) } });
    assert.equal((await raw('vet', 'DELETE', `/horses/${horse._id}/care-events/${shot._id}`)).status, 409);
    const farrier = await api('vet', 'POST', `/horses/${horse._id}/care-events`, { kind: 'farrier', date: day(0).toISOString() }, 201);
    await api('vet', 'DELETE', `/horses/${horse._id}/care-events/${farrier._id}`);
    assert.equal(await models.CareEvent.countDocuments({ horse: horse._id }), 1);
  });

  await t.test('exam request: the vet takes it on with an appointment, or declines with a reason', async () => {
    const request = await api('trainer', 'POST', '/health/exam-requests', { horse: horse._id, reason: 'TEST lame after work' }, 201);
    const at = new Date(Date.now() + 3 * 3600000);
    const accepted = await api('vet', 'PATCH', `/health/exam-requests/${request._id}`, { action: 'accept', scheduledFor: at.toISOString(), note: 'Khám ở chuồng' });
    assert.equal(accepted.status, 'pending', 'still open until the exam is filed');
    assert.ok(accepted.acceptedAt);
    assert.equal(new Date(accepted.scheduledFor).getTime(), at.getTime());
    assert.ok(await models.Notification.exists({ recipientUser: users.trainer.id, message: /đã nhận yêu cầu khám/ }));
    const mine = await api('trainer', 'GET', '/health/exam-requests');
    assert.equal(mine.find((r) => r._id === request._id).acceptedBy.name, 'TEST vet');
    assert.equal((await raw('vet', 'PATCH', `/health/exam-requests/${request._id}`, { action: 'accept', scheduledFor: new Date(Date.now() - 3600000).toISOString() })).status, 400);
    await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST after request', resultStatus: 'eligible', clearedLevel: 'high' }, 201);
    assert.equal((await models.ExamRequest.findById(request._id)).status, 'done', 'the exam still closes it');

    const second = await api('trainer', 'POST', '/health/exam-requests', { horse: horse._id, reason: 'TEST second look' }, 201);
    assert.equal((await raw('vet', 'PATCH', `/health/exam-requests/${second._id}`, { action: 'decline' })).status, 400);
    const declined = await api('vet', 'PATCH', `/health/exam-requests/${second._id}`, { action: 'decline', note: 'Đã khám sáng nay, không cần khám lại' });
    assert.equal(declined.status, 'cancelled');
    assert.ok(await models.Notification.exists({ recipientUser: users.trainer.id, message: /từ chối yêu cầu khám/ }));
  });

  await t.test('exam request: what the trainer saw, the deadline of its priority, and a hold on training', async () => {
    assert.equal((await raw('trainer', 'POST', '/health/exam-requests', { horse: horse._id })).status, 400, 'a reason or a sign is needed');
    assert.equal((await raw('trainer', 'POST', '/health/exam-requests', { horse: horse._id, reason: 'TEST', observedAt: day(1).toISOString() })).status, 400, 'not seen in the future');

    const urgent = await api(
      'trainer',
      'POST',
      '/health/exam-requests',
      { horse: horse._id, priority: 'urgent', symptoms: ['lameness', 'swelling', 'nope'], bodyAreas: ['fore_left'], observedAt: new Date().toISOString(), firstAid: 'Chườm lạnh 15 phút', holdTraining: true, reason: 'TEST khập khiễng sau phi nước đại' },
      201
    );
    assert.deepEqual(urgent.symptoms, ['lameness', 'swelling']);
    assert.deepEqual(urgent.bodyAreas, ['fore_left']);
    assert.equal(urgent.auto, false);
    assert.ok(new Date(urgent.dueBy).getTime() - new Date(urgent.createdAt).getTime() <= 3600000 + 1000, 'urgent: within the hour');
    assert.ok(await models.Notification.exists({ type: 'exam_request', message: /KHẨN CẤP.*Khập khiễng.*chân trước trái.*dừng tập/ }));

    const readiness = await api('trainer', 'GET', `/training/sessions/readiness?horse=${horse._id}&intensity=light`);
    const medical = readiness.gates.find((g) => g.key === 'medical');
    assert.equal(medical.status, 'blocked', 'the hold stops training until a vet has seen the horse');
    assert.match(medical.detail, /Tạm dừng tập chờ bác sĩ khám/);

    assert.equal((await raw('vet', 'PATCH', `/health/exam-requests/${urgent._id}`, { action: 'accept', scheduledFor: new Date(Date.now() + 1800000).toISOString() })).status, 400, 'an urgent request is not booked for later');
    await api('vet', 'PATCH', `/health/exam-requests/${urgent._id}`, { action: 'accept' });
    assert.ok(await models.Notification.exists({ recipientUser: users.trainer.id, message: /đang tới khám/ }));

    await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST viêm gân nhẹ', resultStatus: 'monitoring', vitalSigns: { weightKg: 512 }, clinical: { lamenessGrade: 2, lamenessLimb: 'fore_left', mucousMembrane: 'pink' }, history: 'TEST theo yêu cầu HLV' }, 201);
    assert.equal((await models.ExamRequest.findById(urgent._id)).status, 'done');
    assert.equal((await models.Horse.findById(horse._id)).weightKg, 512, 'the exam weighed the horse');
    const after = await api('trainer', 'GET', `/training/sessions/readiness?horse=${horse._id}&intensity=light`);
    assert.doesNotMatch(after.gates.find((g) => g.key === 'medical').detail, /Tạm dừng tập/, 'the exam lifts the hold');

    const high = await api('trainer', 'POST', '/health/exam-requests', { horse: horse._id, priority: 'high', symptoms: ['breathing'] }, 201);
    assert.equal((await raw('vet', 'PATCH', `/health/exam-requests/${high._id}`, { action: 'accept', scheduledFor: new Date(Date.now() + 8 * 3600000).toISOString() })).status, 400, 'past the 6-hour window');
    await api('vet', 'PATCH', `/health/exam-requests/${high._id}`, { action: 'accept', scheduledFor: new Date(Date.now() + 2 * 3600000).toISOString() });
    assert.equal((await raw('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST', resultStatus: 'eligible', clinical: { gutSounds: 'loud' } })).status, 400, 'a clinical finding from the list');
  });

  await t.test("injuries follow the horse's treatment: started → in treatment, last one ended → recovering", async () => {
    const record = await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST vết thương sườn', resultStatus: 'monitoring' }, 201);
    const marker = await api('vet', 'POST', '/health/injury-markers', { horse: horse._id, healthRecord: record._id, bodyPart: 'TEST Sườn trái', coordinates: { x: 0.5, y: 0.5 }, severity: 'moderate' }, 201);
    assert.equal(marker.recoveryStatus, 'new');
    const treatment = await api('vet', 'POST', '/health/treatments', { horse: horse._id, healthRecord: record._id, status: 'ongoing', careInstructions: 'TEST rửa vết thương' }, 201);
    assert.equal((await models.InjuryMarker.findById(marker._id)).recoveryStatus, 'in_treatment');
    await api('vet', 'PUT', `/health/treatments/${treatment._id}`, { status: 'completed' });
    assert.equal((await models.InjuryMarker.findById(marker._id)).recoveryStatus, 'recovering', 'healed stays the vet’s call');
  });

  await t.test('filed records are not rewritten: an exam, a prescription (ended or replaced instead)', async () => {
    const record = await api('vet', 'POST', '/health/records', { horse: horse._id, diagnosis: 'TEST viêm gân', resultStatus: 'injured' }, 201);
    assert.equal((await raw('vet', 'PUT', `/health/records/${record._id}`, { diagnosis: 'TEST khác' })).status, 409);

    const first = await api('vet', 'POST', '/health/treatments', { horse: horse._id, healthRecord: record._id, status: 'ongoing', trainingLevel: 'none', lockReason: 'TEST nghỉ', careInstructions: 'TEST chườm lạnh' }, 201);
    assert.equal((await raw('vet', 'PUT', `/health/treatments/${first._id}`, { careInstructions: 'TEST khác' })).status, 400, 'not rewritten');
    assert.equal((await raw('vet', 'PUT', `/health/treatments/${first._id}`, { status: 'completed', careInstructions: 'TEST khác' })).status, 400);

    // A new prescription takes over: the old one ends without holding the horse at its old level.
    const second = await api('vet', 'POST', '/health/treatments', { horse: horse._id, healthRecord: record._id, status: 'ongoing', trainingLevel: 'light', lockReason: 'TEST đi bộ', replaces: first._id }, 201);
    const old = await models.Treatment.findById(first._id);
    assert.equal(old.status, 'completed');
    assert.equal(String(old.replacedBy), String(second._id));
    assert.equal(old.returnLevel, null, 'the new prescription’s level counts');
    assert.equal((await api('vet', 'GET', `/horses/${horse._id}`)).trainingClearance.level, 'light');
    assert.equal((await raw('vet', 'PUT', `/health/treatments/${first._id}`, { status: 'completed' })).status, 409, 'already ended');

    await api('vet', 'PUT', `/health/treatments/${second._id}`, { status: 'completed' });
    assert.equal((await models.Treatment.findById(second._id)).returnLevel, 'light', 'ending one that restricts still waits for a return assessment');
  });
});
