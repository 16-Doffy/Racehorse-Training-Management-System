const { test } = require('node:test');
const assert = require('node:assert/strict');
const { taskTiming } = require('../src/utils/taskTiming');

test('a groom can see a meal before its time but only record it from the scheduled minute', () => {
  const at = new Date();
  at.setHours(17, 30, 0, 0);
  const meal = { taskType: 'feeding', mealSlot: 'evening', scheduledDate: at, status: 'pending' };
  assert.equal(taskTiming(meal, new Date(at.getTime() - 60000)).canComplete, false);
  assert.equal(taskTiming(meal, at).canComplete, true);
  assert.equal(taskTiming(meal, new Date(at.getTime() + 4 * 3600000 + 60000)).canComplete, false);
});
