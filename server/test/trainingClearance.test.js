// Run with: npm test
// How hard a horse may work: ongoing treatments, a treatment that ended while it still restricted
// training (waiting for a return assessment), and the vet's latest return assessment.
const test = require('node:test');
const assert = require('node:assert/strict');
const { clearanceFrom } = require('../src/modules/health/trainingClearance');

const DAY = 86400000;
const ago = (days) => new Date(Date.now() - days * DAY);
const ongoing = (level, extra = {}) => ({ _id: `t-${level}`, status: 'ongoing', trainingLevel: level, startDate: ago(5), ...extra });
const ended = (returnLevel, endedDaysAgo) => ({ _id: `e-${returnLevel}`, status: 'completed', returnLevel, endDate: ago(endedDaysAgo) });
const assessment = (clearedLevel, daysAgo) => ({ _id: `r-${clearedLevel}-${daysAgo}`, clearedLevel, date: ago(daysAgo), diagnosis: 'Đánh giá trở lại tập' });

test('no treatment and no assessment: no restriction', () => {
  assert.deepEqual(clearanceFrom([], [], []), { level: 'high', label: 'tập bình thường', restricted: false });
});

test('the strictest ongoing treatment applies', () => {
  const c = clearanceFrom([ongoing('moderate'), ongoing('light', { lockReason: 'Viêm gân' })]);
  assert.equal(c.level, 'light');
  assert.equal(c.source, 'treatment');
  assert.equal(c.reason, 'Viêm gân');
});

test('ending a treatment that still restricted training does not clear the horse', () => {
  const c = clearanceFrom([], [ended('none', 1)], []);
  assert.equal(c.level, 'none');
  assert.equal(c.source, 'awaiting_return');
  assert.match(c.reason, /chờ bác sĩ đánh giá/);
});

test('a return assessment after the treatment ended decides the level', () => {
  assert.equal(clearanceFrom([], [ended('none', 3)], [assessment('light', 1)]).level, 'light');
  assert.equal(clearanceFrom([], [ended('none', 3)], [assessment('high', 1)]).level, 'high');
  // An assessment older than the end of the treatment does not count as the return assessment.
  assert.equal(clearanceFrom([], [ended('light', 1)], [assessment('high', 3)]).level, 'light');
});

test('the newest assessment caps the level until a later one raises it, and other restrictions still apply', () => {
  assert.equal(clearanceFrom([], [], [assessment('high', 1), assessment('light', 10)]).level, 'high');
  assert.equal(clearanceFrom([], [], [assessment('moderate', 1), assessment('high', 10)]).level, 'moderate');
  const both = clearanceFrom([ongoing('light')], [], [assessment('moderate', 1)]);
  assert.equal(both.level, 'light', 'an ongoing treatment stricter than the assessment still applies');
  assert.equal(both.source, 'treatment');
});
