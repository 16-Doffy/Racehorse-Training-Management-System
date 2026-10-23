const { test } = require('node:test');
const assert = require('node:assert/strict');
const { weightWarning, trainingDayWork, workOf, pickFeed, pickSupplements, dayMeals } = require('../src/modules/feeding/rationRules');

const id = (n) => `6500000000000000000000${String(n).padStart(2, '0')}`;
const stock = [
  { _id: id(1), name: 'Cỏ khô Timothy', feedType: 'forage', unit: 'kg', quantity: 300 },
  { _id: id(2), name: 'Cỏ Alfalfa', feedType: 'forage', unit: 'kg', quantity: 40, expiryDate: new Date(Date.now() + 5 * 86400000) },
  { _id: id(3), name: 'Yến mạch', feedType: 'concentrate', unit: 'kg', quantity: 200 },
  { _id: id(4), name: 'Khoáng chất', feedType: 'supplement', unit: 'kg', quantity: 10 },
  { _id: id(5), name: 'Dầu hạt lanh', feedType: 'supplement', unit: 'lít', quantity: 20 },
  { _id: id(6), name: 'Bột điện giải', feedType: 'supplement', unit: 'kg', quantity: 5 },
  { _id: id(7), name: 'Muối liếm', feedType: 'supplement', unit: 'viên', quantity: 40 },
];
const clocks = { morning: '05:30', noon: '11:30', evening: '17:30' };
const monday = new Date('2026-11-02T00:00:00');
const sunday = new Date('2026-11-08T00:00:00');
const phase = (key, intensity) => ({ key, intensity, week: [1, 2, 3, 4, 5, 6].map((day) => ({ day, kind: 'canter' })) });
const amountOf = (meal, name) => meal.items.find((i) => i.name === name)?.amount;

test('a weight a racehorse cannot have is flagged before anything is confirmed', () => {
  assert.match(weightWarning(200), /200 kg bất thường/);
  assert.equal(weightWarning(480), null);
  assert.match(weightWarning(undefined), /tạm tính 500 kg/);
});

test('the day\'s work: the phase on a training day, rest on a day the template skips, light in recovery', () => {
  assert.equal(workOf(phase('speed', 'high'), monday), 'high');
  assert.equal(workOf(phase('speed', 'high'), sunday), 'rest');
  assert.equal(workOf(phase('recovery', 'moderate'), monday), 'light');
  assert.equal(workOf(null, monday), 'rest');
  assert.equal(trainingDayWork(phase('speed', 'high')), 'high', 'a standing ration is set for a training day');
  assert.equal(trainingDayWork({ key: 'speed', intensity: 'high', week: [] }), 'rest', 'a template that trains on no day');
});

test('stock: the horse\'s current item first, else enough for the week, expiring first', () => {
  assert.equal(pickFeed(stock, 'forage', { keep: [id(2)], weekNeed: 60 }).name, 'Cỏ Alfalfa', 'what it already eats');
  assert.equal(pickFeed(stock, 'forage', { weekNeed: 60 }).name, 'Cỏ khô Timothy', 'Alfalfa would not last the week');
  assert.equal(pickFeed(stock, 'forage', { weekNeed: 10 }).name, 'Cỏ Alfalfa', 'both last: the one expiring first');
  const kinds = pickSupplements(stock).map((s) => s.rule.key);
  assert.deepEqual(kinds, ['mineral', 'oil', 'electrolyte'], 'a salt lick counted in "viên" has no dose');
});

test('meals have roles: a light breakfast before training, the main meal at night, supplements by phase and work', () => {
  const feeds = { forage: stock[0], concentrate: stock[2], supplements: pickSupplements(stock) };
  const [breakfast, lunch, dinner] = dayMeals({ weightKg: 480, work: 'high', phase: phase('speed', 'high'), clocks, feeds });
  assert.ok(amountOf(dinner, 'Yến mạch') > amountOf(breakfast, 'Yến mạch'), 'less grain before the work');
  assert.ok(amountOf(dinner, 'Yến mạch') <= 480 * 0.005, 'never more than 0.5% of body weight in one meal');
  assert.equal(amountOf(dinner, 'Khoáng chất'), 0.05);
  assert.equal(amountOf(dinner, 'Dầu hạt lanh'), 0.1, 'oil in the speed phase');
  assert.equal(amountOf(dinner, 'Bột điện giải'), 0.05, 'electrolytes on a hard day');
  assert.equal(amountOf(lunch, 'Khoáng chất'), undefined, 'supplements in the evening only');

  const [restBreakfast, , restDinner] = dayMeals({ weightKg: 480, work: 'rest', phase: phase('base_building', 'moderate'), clocks, feeds });
  assert.ok(amountOf(restDinner, 'Yến mạch') < amountOf(dinner, 'Yến mạch'), 'a rest day has less grain');
  assert.equal(amountOf(restDinner, 'Dầu hạt lanh'), undefined, 'no oil in the base phase');
  assert.equal(amountOf(restDinner, 'Bột điện giải'), undefined, 'no electrolytes on a rest day');
  assert.ok(amountOf(restBreakfast, 'Cỏ khô Timothy') >= 0.5);
});
