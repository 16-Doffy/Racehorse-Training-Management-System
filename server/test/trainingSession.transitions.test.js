// Run with: npm test   (Node's built-in runner, no extra dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SESSION_STATUS: S,
  SESSION_TRANSITIONS,
  SESSION_STATUS_LABELS,
  canTransition,
} = require('../src/constants/training');

test('completed and cancelled are final', () => {
  for (const to of Object.values(S)) {
    assert.equal(canTransition(S.COMPLETED, to), false, `completed -> ${to}`);
    assert.equal(canTransition(S.CANCELLED, to), false, `cancelled -> ${to}`);
  }
});

test('a running session cannot go back to scheduled or start again', () => {
  assert.equal(canTransition(S.IN_PROGRESS, S.SCHEDULED), false);
  assert.equal(canTransition(S.IN_PROGRESS, S.IN_PROGRESS), false);
});

test('unknown statuses never transition', () => {
  assert.equal(canTransition('nope', S.COMPLETED), false);
  assert.equal(canTransition(S.SCHEDULED, 'nope'), false);
  assert.equal(canTransition(undefined, undefined), false);
});

test('every status has a label and the tables are frozen', () => {
  for (const status of Object.values(S)) assert.ok(SESSION_STATUS_LABELS[status], status);
  assert.throws(() => {
    'use strict';
    SESSION_TRANSITIONS.completed = ['scheduled'];
  });
});

test('a session is started only from ready and completed only after it ran', () => {
  assert.equal(canTransition(S.SCHEDULED, S.COMPLETED), false);
  assert.equal(canTransition(S.READY, S.COMPLETED), false);
  assert.equal(canTransition(S.IN_PROGRESS, S.COMPLETED), true);
});

test('a session is started only from ready; aborted/evaluated still have no way in', () => {
  assert.deepEqual(SESSION_TRANSITIONS[S.SCHEDULED], [S.READY, S.BLOCKED, S.CANCELLED, S.MISSED]);
  assert.deepEqual(SESSION_TRANSITIONS[S.READY], [S.IN_PROGRESS, S.BLOCKED, S.CANCELLED, S.MISSED]);
  assert.equal(canTransition(S.SCHEDULED, S.IN_PROGRESS), false);
  assert.equal(canTransition(S.BLOCKED, S.IN_PROGRESS), false);
  assert.deepEqual(SESSION_TRANSITIONS[S.BLOCKED], [S.READY, S.CANCELLED, S.MISSED]);
  for (const target of [S.EVALUATED, S.ABORTED]) {
    for (const from of Object.values(S)) assert.equal(canTransition(from, target), false, `${from} -> ${target}`);
  }
});

test('missed is reached only from a session that never ran (set by the missed-session job)', () => {
  const into = Object.values(S).filter((from) => canTransition(from, S.MISSED)).sort();
  assert.deepEqual(into, [S.BLOCKED, S.READY, S.SCHEDULED].sort());
  assert.deepEqual(SESSION_TRANSITIONS[S.MISSED], []);
  const { SESSION_BODY_STATUSES } = require('../src/constants/training');
  assert.equal(SESSION_BODY_STATUSES.includes(S.MISSED), false);
});

test('a request body can only ask for completed or cancelled', () => {
  const { SESSION_BODY_STATUSES } = require('../src/constants/training');
  assert.deepEqual([...SESSION_BODY_STATUSES].sort(), [S.CANCELLED, S.COMPLETED].sort());
});

test('the pre-check window runs from 60 minutes before to 30 minutes after the session', () => {
  const { preCheckWindow } = require('../src/constants/training');
  const at = new Date('2026-10-08T08:00:00Z');
  const at2 = (min) => new Date(at.getTime() + min * 60000);
  assert.equal(preCheckWindow(at, at2(-61)).open, false);
  assert.equal(preCheckWindow(at, at2(-60)).open, true);
  assert.equal(preCheckWindow(at, at2(0)).open, true);
  assert.equal(preCheckWindow(at, at2(30)).open, true);
  assert.equal(preCheckWindow(at, at2(31)).open, false);
  assert.equal(preCheckWindow(at, at2(0)).opensAt.getTime(), at2(-60).getTime());
});

test('every status has a table entry', () => {
  assert.deepEqual(Object.keys(SESSION_TRANSITIONS).sort(), Object.values(S).sort());
});

test('a lock stops booked and running sessions, an archive also the blocked ones', () => {
  const { SESSION_LOCK_CANCELS, SESSION_OPEN_STATUSES, SESSION_DONE_STATUSES } = require('../src/constants/training');
  assert.deepEqual([...SESSION_LOCK_CANCELS].sort(), [S.IN_PROGRESS, S.READY, S.SCHEDULED].sort());
  assert.ok(SESSION_OPEN_STATUSES.includes(S.BLOCKED));
  assert.deepEqual([...SESSION_DONE_STATUSES].sort(), [S.COMPLETED, S.EVALUATED].sort());
  for (const done of [S.COMPLETED, S.EVALUATED, S.ABORTED, S.CANCELLED, S.MISSED]) {
    assert.equal(SESSION_OPEN_STATUSES.includes(done), false, done);
  }
});

test('the session schema accepts every status and keeps actual times empty by default', () => {
  const TrainingSession = require('../src/models/TrainingSession');
  const doc = new TrainingSession({ trainingPlan: '64b000000000000000000001', horse: '64b000000000000000000002', scheduledAt: new Date() });
  assert.equal(doc.status, S.SCHEDULED);
  assert.equal(doc.actualStartAt, null);
  assert.equal(doc.actualEndAt, null);
  for (const status of Object.values(S)) {
    doc.status = status;
    assert.equal(doc.validateSync()?.errors?.status, undefined, status);
  }
  doc.status = 'running';
  assert.ok(doc.validateSync().errors.status);
});
