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
