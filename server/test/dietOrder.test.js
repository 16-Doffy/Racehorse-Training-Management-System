const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dayMeals, dayFocus, rationBasis } = require('../src/modules/feeding/rationRules');
const { RAMP, rampDay, rampFactor, dietSummary } = require('../src/modules/feeding/dietOrder');

const id = (n) => `6500000000000000000000${String(n).padStart(2, '0')}`;
const hay = { _id: id(1), name: 'Cỏ khô Timothy', feedType: 'forage', unit: 'kg' };
const oats = { _id: id(3), name: 'Yến mạch', feedType: 'concentrate', unit: 'kg' };
const minerals = { _id: id(4), name: 'Khoáng chất', feedType: 'supplement', unit: 'kg' };
const feeds = { forage: hay, concentrate: oats, supplements: [{ rule: { applies: () => true, dose: { kg: 0.05 } }, item: minerals }] };
const clocks = { morning: '05:30', noon: '11:30', evening: '17:30' };
const sum = (meals, name) => meals.flatMap((m) => m.items).filter((i) => i.name === name).reduce((n, i) => n + i.amount, 0);
const sick = (sickKind) => dayMeals({ weightKg: 500, work: 'high', phase: { key: 'speed' }, clocks, feeds, diet: 'sick', sickKind });
const day = (offset) => new Date(new Date('2026-11-10T00:00:00').getTime() + offset * 86400000);

test('the vet\'s sick diet sets the meals: no grain after colic or with laminitis, hay spread evenly', () => {
  for (const kind of ['colic', 'laminitis']) {
    const meals = sick(kind);
    assert.equal(sum(meals, 'Yến mạch'), 0, `${kind}: no concentrate`);
    const hays = meals.map((m) => m.items.find((i) => i.name === hay.name)?.amount);
    assert.ok(Math.max(...hays) - Math.min(...hays) <= 0.5, `${kind}: the hay spread evenly over the three meals`);
  }
  // Colic: less hay than box rest; box rest and a cough keep the same amounts.
  assert.ok(sum(sick('colic'), hay.name) < sum(sick('rest'), hay.name));
  assert.deepEqual(sick('respiratory'), sick('rest'));
  // Ulcers: the little grain, the hay over the whole day (lunch as big as the others).
  const ulcer = sick('ulcer');
  assert.ok(sum(ulcer, 'Yến mạch') > 0);
  assert.equal(ulcer[1].items.find((i) => i.name === hay.name).amount, ulcer[0].items.find((i) => i.name === hay.name).amount);
  // Minerals still, whatever the diet.
  assert.ok(sum(sick('colic'), minerals.name) > 0);
  // An unknown kind is box rest.
  assert.deepEqual(sick('???'), sick('rest'));
});

test('the sick diet\'s hay preference and its line for the trainer', () => {
  assert.equal(dayFocus([{ kind: 'gallop' }], 'sick', 'ulcer'), 'sick_ulcer');
  assert.equal(dayFocus([{ kind: 'gallop' }], 'sick', 'respiratory'), 'rest');
  assert.equal(dayFocus([{ kind: 'gallop' }], 'normal', 'colic'), 'speed');
  assert.match(rationBasis('speed', 'high', [], 'sick', [], { sickKind: 'colic' }), /^Chế độ bệnh · Đau bụng \(colic\): .*không thức ăn tinh/);
  assert.match(rationBasis('speed', 'high', [], 'sick'), /Nghỉ chuồng/);
});

test('back from an illness the concentrate builds up over a week, the hay whole from day one', () => {
  const back = day(0);
  assert.equal(rampDay(back, day(-1)), null);
  assert.equal(rampDay(back, day(0)), 1);
  assert.equal(rampDay(back, day(RAMP.length - 1)), RAMP.length);
  assert.equal(rampDay(back, day(RAMP.length)), null);
  assert.equal(rampFactor(null, day(0)), 1);
  const factors = RAMP.map((_, n) => rampFactor(back, day(n)));
  assert.deepEqual(factors, [...factors].sort((a, b) => a - b), 'never less than the day before');
  assert.equal(rampFactor(back, day(RAMP.length)), 1);

  const full = dayMeals({ weightKg: 500, work: 'high', phase: { key: 'speed' }, clocks, feeds });
  const first = dayMeals({ weightKg: 500, work: 'high', phase: { key: 'speed' }, clocks, feeds, ramp: rampFactor(back, day(0)) });
  assert.ok(sum(first, 'Yến mạch') < sum(full, 'Yến mạch'));
  assert.equal(sum(first, hay.name), sum(full, hay.name));
  // The ramp is for a horse eating its training ration: a sick day is not touched by it.
  assert.deepEqual(dayMeals({ weightKg: 500, work: 'high', phase: null, clocks, feeds, diet: 'sick', ramp: 0.5 }), sick('rest'));
  assert.match(rationBasis('speed', 'high', [], 'normal', [], { ramp: 0.5 }), /^Tập ăn lại sau bệnh: thức ăn tinh 50%/);
});

test('what the groom reads: the vet\'s diet while not fit, the week back after it, nothing once eating as planned', () => {
  assert.equal(dietSummary({ healthStatus: 'eligible' }), null);
  const injured = dietSummary({ healthStatus: 'injured', vetDiet: { kind: 'laminitis', note: 'Ngâm cỏ 1 giờ' } });
  assert.equal(injured.diet, 'sick');
  assert.equal(injured.kind, 'laminitis');
  assert.match(injured.care, /không ngũ cốc/);
  assert.equal(injured.note, 'Ngâm cỏ 1 giờ');
  // Injured without an order: box rest. Under monitoring: only what the vet ordered.
  assert.equal(dietSummary({ healthStatus: 'quarantined' }).kind, 'rest');
  assert.equal(dietSummary({ healthStatus: 'monitoring', vetDiet: { kind: 'ulcer' } }).kind, 'ulcer');
  assert.equal(dietSummary({ healthStatus: 'monitoring', vetDiet: { kind: 'plan' } }), null);
  const ramp = dietSummary({ healthStatus: 'eligible', backToFeedAt: day(0) }, day(2));
  assert.equal(ramp.diet, 'ramp');
  assert.equal(ramp.day, 3);
  assert.equal(ramp.percent, Math.round(RAMP[2] * 100));
  assert.equal(dietSummary({ healthStatus: 'eligible', backToFeedAt: day(0) }, day(RAMP.length)), null);
});
