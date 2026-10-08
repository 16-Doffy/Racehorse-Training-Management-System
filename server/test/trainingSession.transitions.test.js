// Run with: npm test   (Node's built-in runner, no extra dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SESSION_STATUS: S,
  SESSION_TRANSITIONS,
  SESSION_STATUS_LABELS,
  canTransition,
} = require('../src/constants/training');

test('allowed transitions match the lifecycle as it is today', () => {
  assert.deepEqual(SESSION_TRANSITIONS[S.SCHEDULED], [S.IN_PROGRESS, S.COMPLETED, S.CANCELLED]);
  assert.deepEqual(SESSION_TRANSITIONS[S.IN_PROGRESS], [S.COMPLETED, S.CANCELLED]);
});

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

test('the new statuses exist but nothing can reach them yet', () => {
  const unreachable = [S.READY, S.BLOCKED, S.EVALUATED, S.ABORTED, S.MISSED];
  for (const target of unreachable) {
    for (const from of Object.values(S)) {
      assert.equal(canTransition(from, target), false, `${from} -> ${target}`);
    }
    assert.deepEqual(SESSION_TRANSITIONS[target], [], `${target} has no way out yet`);
  }
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
