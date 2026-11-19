const { test } = require('node:test');
const assert = require('node:assert/strict');
const { minPrepFor, earliestRaceDate, suggestPhases } = require('../src/constants/training');
const { phaseCompletion, layout } = require('../src/modules/training/planProgress');
const { raceForm } = require('../src/modules/training/raceForm');

const DAY = 24 * 60 * 60 * 1000;

test('a race is entered only far enough ahead to prepare for its distance', () => {
  const today = new Date('2026-11-19T10:00:00');
  // A 2400 m race: two months of build-up, plus recovery, the days before the race and the plan's start.
  assert.equal(minPrepFor(2400).weeks, 8);
  assert.equal(minPrepFor(2400).days, 70);
  const earliest = earliestRaceDate(2400, today);
  assert.equal(earliest.toDateString(), new Date('2027-01-28T00:00:00').toDateString());
  assert.ok(new Date('2026-12-19') < earliest, '19/12/2026 is too soon for 2400 m');
  assert.ok(new Date('2027-03-19') >= earliest, '19/03/2027 leaves time');
  assert.ok(minPrepFor(1000).days < minPrepFor(1600).days && minPrepFor(1600).days < minPrepFor(2400).days, 'longer races need longer');
});

test('more time to the race gives a different, longer build-up; the taper stays one or two weeks', () => {
  const start = new Date('2026-11-23T00:00:00');
  const march = suggestPhases(start, new Date('2027-03-19T00:00:00'), 2400);
  const april = suggestPhases(start, new Date('2027-04-19T00:00:00'), 2400);
  const weeksOf = (phases, key) => phases.find((p) => p.key === key).weeks;
  assert.ok(weeksOf(april, 'base_building') > weeksOf(march, 'base_building'));
  for (const phases of [march, april]) assert.ok(weeksOf(phases, 'peak') <= 2);
});

test('a race needs every phase before the taper judged done by the trainer', () => {
  const start = new Date('2026-09-07T00:00:00');
  const phases = layout(start, [
    { key: 'base_building', weeks: 4, extraDays: 0 },
    { key: 'strength', weeks: 3, extraDays: 0 },
    { key: 'speed', weeks: 3, extraDays: 0 },
    { key: 'peak', weeks: 1, extraDays: 0 },
    { key: 'recovery', weeks: 1, extraDays: -3 },
  ]);
  const at = (n) => new Date(start.getTime() + n * DAY);
  const race = { raceName: 'TEST Cup', raceDate: at(84), status: 'registered' };
  // Mid-strength, base judged done: on the way, not yet ready.
  const midway = phaseCompletion(phases, [{ phaseIndex: 0, result: 'passed', at: at(27) }], at(35));
  assert.deepEqual(midway.map((s) => s.state), ['passed', 'current', 'ahead']);
  const form = raceForm({ stats: [], race, now: at(35), phases, checkpoints: [{ phaseIndex: 0, result: 'passed', at: at(27) }] });
  assert.equal(form.status, 'on_track');
  assert.match(form.reasons[0], /Cần HLV đánh giá hoàn thành Sức mạnh, Tốc độ/);
  // A phase over without the trainer's "done": not ready.
  const skipped = raceForm({ stats: [], race, now: at(52), phases, checkpoints: [{ phaseIndex: 0, result: 'passed', at: at(27) }] });
  assert.equal(skipped.status, 'not_ready');
  assert.match(skipped.reasons[0], /Chưa hoàn thành giai đoạn Sức mạnh/);
  // All three done and the trial passed: ready.
  const done = [0, 1, 2].map((i) => ({ phaseIndex: i, result: 'passed', at: at(27 + i * 21) }));
  const ready = raceForm({ stats: [], trials: [{ at: at(76), met: true }], race, now: at(78), phases, checkpoints: done });
  assert.equal(ready.status, 'ready');
  assert.ok(ready.checks.filter((c) => c.key.startsWith('phase-')).every((c) => c.ok === true));
});
