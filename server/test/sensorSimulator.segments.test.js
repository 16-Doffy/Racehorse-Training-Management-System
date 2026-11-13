const { test } = require('node:test');
const assert = require('node:assert/strict');
const { targetsOf } = require('../src/realtime/sensorSimulator');

test('targetsOf keeps unsegmented sessions unchanged', () => {
  const target = targetsOf({
    kind: 'canter',
    prescription: { distanceM: 2400, targetSpeedKmh: 35, targetHeartRateMax: 170 },
    metrics: { distance: 0 },
  });
  assert.equal(target.isSegmented, false);
  assert.equal(target.speed, 35);
  assert.equal(target.heartRateMax, 170);
  assert.equal(target.distance, 2400);
});

test('targetsOf steps through multi-segment sessions sequentially across distance bounds', () => {
  const session = {
    kind: 'canter',
    segments: [
      { kind: 'walk', durationMinutes: 15, note: 'Khởi động' },
      { kind: 'canter', durationMinutes: 20, distanceM: 2400, note: 'Bài chính' },
      { kind: 'walk', durationMinutes: 10, note: 'Thả lỏng' },
    ],
    metrics: { distance: 0 },
  };

  const t0 = targetsOf(session, 0);
  assert.equal(t0.isSegmented, true);
  assert.equal(t0.segmentCount, 3);
  assert.equal(t0.currentSegmentIndex, 0);
  assert.equal(t0.segmentKind, 'walk');
  assert.equal(t0.speed, 12);
  assert.equal(t0.heartRateMax, 120);
  assert.equal(t0.distance, 5733);
  assert.equal(t0.durationMinutes, 45);

  const t1 = targetsOf(session, 2000);
  assert.equal(t1.currentSegmentIndex, 1);
  assert.equal(t1.segmentKind, 'canter');
  assert.equal(t1.speed, 35);
  assert.equal(t1.heartRateMax, 170);

  const t2 = targetsOf(session, 4400);
  assert.equal(t2.currentSegmentIndex, 2);
  assert.equal(t2.segmentKind, 'walk');
  assert.equal(t2.segmentNote, 'Thả lỏng');
});
