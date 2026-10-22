// Run with: npm test
// How fast each exam-request priority must be answered, and what the vet may book for it.
const test = require('node:test');
const assert = require('node:assert/strict');

const { BODY_AREAS, EXAM_SYMPTOMS, dueByOf, dueByOfRequest, knownKeys, scheduleProblem } = require('../src/constants/examRequest');

const HOUR = 3600000;
const sent = new Date('2026-10-22T08:00:00');
const later = (hours) => new Date(sent.getTime() + hours * HOUR);

test('each priority has its window: urgent 1 hour, high 6 hours, normal 3 days', () => {
  assert.equal(dueByOf('urgent', sent).getTime(), later(1).getTime());
  assert.equal(dueByOf('high', sent).getTime(), later(6).getTime());
  assert.equal(dueByOf('normal', sent).getTime(), later(72).getTime());
  assert.equal(dueByOf('nonsense', sent).getTime(), later(72).getTime(), 'an unknown priority reads as normal');
});

test('an older request without dueBy gets its deadline from when it was sent', () => {
  assert.equal(dueByOfRequest({ priority: 'high', createdAt: sent }).getTime(), later(6).getTime());
  assert.equal(dueByOfRequest({ priority: 'high', createdAt: sent, dueBy: later(2) }).getTime(), later(2).getTime());
});

test('an urgent request is never booked for later; taking it on with no time is fine', () => {
  const urgent = { priority: 'urgent', createdAt: sent };
  assert.match(scheduleProblem(urgent, later(0.5)), /khẩn cấp/);
  assert.equal(scheduleProblem(urgent, null), null);
});

test('a high or normal request is booked only inside its window', () => {
  const high = { priority: 'high', createdAt: sent };
  assert.equal(scheduleProblem(high, later(5)), null);
  assert.match(scheduleProblem(high, later(7)), /ưu tiên cao cần khám trước/);
  const normal = { priority: 'normal', createdAt: sent };
  assert.equal(scheduleProblem(normal, later(48)), null);
  assert.match(scheduleProblem(normal, later(80)), /bình thường cần khám trước/);
});

test('only known symptom and body-area keys are kept, once each', () => {
  assert.deepEqual(knownKeys(['lameness', 'lameness', 'made_up', 7, 'fever'], EXAM_SYMPTOMS), ['lameness', 'fever']);
  assert.deepEqual(knownKeys('fore_left', BODY_AREAS), []);
  assert.deepEqual(knownKeys(['fore_left'], BODY_AREAS), ['fore_left']);
});
