const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startIntegration, intake } = require('../../test-support/integration');

// The vet's redesigned screens: prescription templates (ready-made prescriptions per condition) and
// injuries marked on the 3D horse — on the skin or on an organ inside.
test('vet prescribing: prescription templates and injuries placed on the 3D horse', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('vetrx');
  t.after(() => ctx.close());
  const { api, raw } = ctx;
  const { horse } = await intake(ctx, 'TEST Template Horse');
  const bute = await api('manager', 'POST', '/inventory', { name: 'TEST Bute 1g', category: 'medicine', unit: 'viên', quantity: 50 }, 201);

  await t.test('a template is saved under its name; saving the same name again updates it', async () => {
    const template = {
      name: 'Viêm gân / căng cơ',
      condition: 'Sưng nóng gân',
      days: 7,
      trainingLevel: 'none',
      lockReason: 'Nghỉ tại chuồng',
      careInstructions: 'Chườm lạnh 20 phút sáng và chiều.',
      medications: [{ name: 'TEST Bute 1g', inventoryItem: bute._id, amount: 1, unit: 'viên', route: 'oral', times: ['20:00', '08:00'], days: 5 }],
    };
    const saved = await api('vet', 'POST', '/health/prescription-templates', template, 201);
    assert.equal(saved.createdBy.name, 'TEST vet');
    assert.deepEqual(saved.medications[0].times, ['08:00', '20:00']);
    assert.equal(String(saved.medications[0].inventoryItem), String(bute._id));

    const updated = await api('vet', 'POST', '/health/prescription-templates', { ...template, days: 10 });
    assert.equal(String(updated._id), String(saved._id));
    assert.equal(updated.days, 10);
    const list = await api('vet', 'GET', '/health/prescription-templates');
    assert.equal(list.length, 1);

    assert.equal((await raw('vet', 'POST', '/health/prescription-templates', { ...template, name: '' })).status, 400);
    assert.equal((await raw('vet', 'POST', '/health/prescription-templates', { ...template, name: 'Bad time', medications: [{ name: 'X', times: ['25:00'] }] })).status, 400);
    assert.equal((await raw('vet', 'POST', '/health/prescription-templates', { name: 'Empty', medications: [] })).status, 400);
    assert.equal((await raw('trainer', 'GET', '/health/prescription-templates')).status, 403);

    assert.equal((await raw('vet', 'DELETE', `/health/prescription-templates/${saved._id}`)).status, 200);
    assert.equal((await raw('vet', 'DELETE', `/health/prescription-templates/${saved._id}`)).status, 404);
  });

  await t.test('an injury keeps where it was marked on the 3D horse, on the skin or inside', async () => {
    const onSkin = await api('vet', 'POST', '/health/injury-markers', {
      horse: horse._id,
      bodyPart: 'Khớp cổ chân trước trái',
      coordinates: { x: 0.39, y: 0.88 },
      location3d: { position: { x: 0.12, y: 0.15, z: 2.4 }, normal: { x: 0.9, y: 0, z: 0.4 } },
      severity: 'moderate',
    }, 201);
    assert.equal(onSkin.location3d.layer, 'surface');
    assert.equal(onSkin.location3d.position.z, 2.4);

    const inside = await api('vet', 'POST', '/health/injury-markers', {
      horse: horse._id,
      bodyPart: 'Phổi phải',
      coordinates: { x: 0.44, y: 0.31 },
      location3d: { position: { x: -0.13, y: 1.49, z: 1.94 }, layer: 'internal' },
      severity: 'severe',
    }, 201);
    assert.equal(inside.location3d.layer, 'internal');
    assert.equal(inside.location3d.normal, undefined);

    const bad = await raw('vet', 'POST', '/health/injury-markers', { horse: horse._id, bodyPart: 'X', coordinates: { x: 0.5, y: 0.5 }, location3d: { position: { x: 1, y: 2 } }, severity: 'mild' });
    assert.equal(bad.status, 400);
    const badLayer = await raw('vet', 'POST', '/health/injury-markers', { horse: horse._id, bodyPart: 'X', coordinates: { x: 0.5, y: 0.5 }, location3d: { position: { x: 0, y: 1, z: 2 }, layer: 'bone' }, severity: 'mild' });
    assert.equal(badLayer.status, 400);

    // A mark from before the 3D map has only coordinates, and keeps working.
    const old = await api('vet', 'POST', '/health/injury-markers', { horse: horse._id, bodyPart: 'Lưng', coordinates: { x: 0.5, y: 0.3 }, severity: 'mild' }, 201);
    assert.equal(old.location3d, undefined);

    // Once recorded, an injury is not rewritten nor deleted: only its recovery moves on.
    assert.equal((await raw('vet', 'PUT', `/health/injury-markers/${onSkin._id}`, { location3d: null })).status, 400);
    assert.equal((await raw('vet', 'PUT', `/health/injury-markers/${onSkin._id}`, { severity: 'mild', recoveryStatus: 'recovering' })).status, 400);
    const moved = await api('vet', 'PUT', `/health/injury-markers/${onSkin._id}`, { recoveryStatus: 'recovering' });
    assert.equal(moved.recoveryStatus, 'recovering');
    assert.equal((await raw('vet', 'DELETE', `/health/injury-markers/${old._id}`)).status, 409);
  });
});
