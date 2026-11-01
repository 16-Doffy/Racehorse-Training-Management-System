const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake } = require('../../test-support/integration');

test('a horse moves with its health: recovery or isolation when the vet says so, back to its kept stall when fit', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('healthplacement');
  t.after(() => ctx.close());
  const { api, raw, models } = ctx;
  const a = await api('manager', 'POST', '/stable/stalls/generate', { zone: 'A', count: 3, zoneName: 'Khu A' }, 201);
  const r = await api('manager', 'POST', '/stable/stalls/generate', { zone: 'R', count: 1, zoneName: 'Khu hồi phục', type: 'recovery' }, 201);
  await api('manager', 'POST', '/stable/stalls/generate', { zone: 'Q', count: 1, zoneName: 'Khu cách ly', type: 'isolation' }, 201);
  const { horse: first } = await intake(ctx, 'TEST Placement One');
  const { horse: second } = await intake(ctx, 'TEST Placement Two');
  const { horse: third } = await intake(ctx, 'TEST Placement Three');
  await api('manager', 'POST', '/stable/assignments', { horse: first._id, stall: a.created[0]._id }, 201);
  await api('manager', 'POST', '/stable/assignments', { horse: second._id, stall: a.created[1]._id }, 201);
  const where = async (horse) => {
    const asg = await models.StableAssignment.findOne({ horse: horse._id }).populate('stall', 'code').populate('homeStall', 'code').lean();
    return { stall: asg.stall?.code, home: asg.homeStall?.code || null, pending: asg.pendingMove };
  };
  const exam = (horse, resultStatus) => api('vet', 'POST', '/health/records', {
    horse: horse._id, diagnosis: `TEST ${resultStatus}`, resultStatus,
    ...(resultStatus === 'eligible' ? { clearedLevel: 'high' } : {}), vitalSigns: { temperatureC: 37.8, heartRate: 38 },
  }, 201);

  // Injured: into the recovery stall, its own stall kept for it.
  await exam(first, 'injured');
  assert.deepEqual(await where(first), { stall: 'R-01', home: 'A-01', pending: null });
  assert.ok(await models.Notification.exists({ horse: first._id, message: /đã tự chuyển từ A-01 sang chuồng hồi phục R-01/ }));
  const map = await api('manager', 'GET', '/stable/stalls');
  const kept = map.stalls.find((s) => s.code === 'A-01');
  assert.equal(kept.occupied, false);
  assert.equal(kept.reservedFor.horse.name, 'TEST Placement One');
  // Nobody else is placed in the kept stall, by hand or by the system.
  assert.equal((await raw('manager', 'POST', '/stable/assignments', { horse: third._id, stall: a.created[0]._id })).status, 409);

  // Quarantined: from recovery to isolation, the same stall still kept.
  await exam(first, 'quarantined');
  assert.deepEqual(await where(first), { stall: 'Q-01', home: 'A-01', pending: null });

  // Another horse injured while... the recovery stall is free again (the first left it): it moves in.
  await exam(second, 'injured');
  assert.deepEqual(await where(second), { stall: 'R-01', home: 'A-02', pending: null });

  // The first is fit only for monitoring then injured again: the recovery stall is taken, so it waits.
  await exam(first, 'injured');
  assert.deepEqual(await where(first), { stall: 'Q-01', home: 'A-01', pending: 'recovery' });
  assert.ok(await models.Notification.exists({ horse: first._id, recipientRole: 'manager', message: /chưa có chuồng hồi phục trống/ }));

  // The second is fit: back to its own stall; the hourly run then moves the first into the freed recovery stall.
  await exam(second, 'eligible');
  assert.deepEqual(await where(second), { stall: 'A-02', home: null, pending: null });
  const { retryWaitingMoves } = require('../../src/modules/stable/healthPlacement.service');
  assert.equal(await retryWaitingMoves(), 1);
  assert.deepEqual(await where(first), { stall: 'R-01', home: 'A-01', pending: null });

  // Fit again: home to A-01, nothing kept any more; under monitoring a horse stays where it is.
  await exam(first, 'eligible');
  assert.deepEqual(await where(first), { stall: 'A-01', home: null, pending: null });
  await exam(first, 'monitoring');
  assert.deepEqual(await where(first), { stall: 'A-01', home: null, pending: null });
  assert.equal((await api('manager', 'GET', '/stable/stalls')).stalls.find((s) => s.code === 'A-01').reservedFor, null);
});
