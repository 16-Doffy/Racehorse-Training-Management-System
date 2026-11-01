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

test('stock stocked before feed kinds existed is still found, by its name', () => {
  // As the feeding calendar reads stock (a few fields, no category): no kind stored on these items.
  const old = stock.map(({ feedType, ...item }) => item);
  assert.equal(pickFeed(old, 'forage', { weekNeed: 60 }).name, 'Cỏ khô Timothy', 'hay without a stored kind is forage');
  assert.equal(pickFeed(old, 'concentrate', { weekNeed: 10 }).name, 'Yến mạch');
  assert.deepEqual(pickSupplements(old).map((s) => s.rule.key), ['mineral', 'oil', 'electrolyte']);
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

test('an injured or isolated horse eats the sick diet whatever its plan: forage as at rest, the least grain, minerals only', () => {
  const { dietOf } = require('../src/modules/feeding/rationRules');
  assert.equal(dietOf('injured'), 'sick');
  assert.equal(dietOf('quarantined'), 'sick');
  assert.equal(dietOf('eligible'), 'normal');
  const feeds = { forage: stock[0], concentrate: stock[2], supplements: pickSupplements(stock) };
  const total = (meals, name) => meals.flatMap((m) => m.items).filter((i) => i.name === name).reduce((n, i) => n + i.amount, 0);
  const hard = dayMeals({ weightKg: 500, work: 'high', phase: phase('speed', 'high'), clocks, feeds });
  const rest = dayMeals({ weightKg: 500, work: 'rest', phase: phase('speed', 'high'), clocks, feeds });
  const sick = dayMeals({ weightKg: 500, work: 'high', phase: phase('speed', 'high'), clocks, feeds, diet: 'sick' });
  assert.ok(total(sick, 'Yến mạch') < total(rest, 'Yến mạch'), 'less grain than even a rest day');
  assert.ok(total(sick, 'Yến mạch') < total(hard, 'Yến mạch'));
  assert.ok(total(sick, 'Cỏ khô Timothy') >= total(rest, 'Cỏ khô Timothy'), 'forage kept up');
  assert.equal(amountOf(sick[1], 'Yến mạch'), undefined, 'no grain at lunch');
  assert.equal(amountOf(sick[2], 'Dầu hạt lanh'), undefined, 'no oil');
  assert.equal(amountOf(sick[2], 'Bột điện giải'), undefined, 'no electrolytes');
  assert.ok(amountOf(sick[2], 'Khoáng chất') > 0, 'minerals still');
});
