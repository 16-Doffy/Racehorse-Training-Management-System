const { test } = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/modules/training/planProgress');

const DAY = 86400000;
const start = new Date('2026-09-07T00:00:00'); // a Monday
const day = (n) => new Date(start.getTime() + n * DAY);
// 4 + 3 + 3 + 1 weeks ending with the trial, 4 days of recovery, done PRE_RACE_DAYS before the race.
const cycle = () => [
  { key: 'base_building', weeks: 4, extraDays: 0 },
  { key: 'strength', weeks: 3, extraDays: 0 },
  { key: 'speed', weeks: 3, extraDays: 0 },
  { key: 'peak', weeks: 1, extraDays: 0 },
  { key: 'recovery', weeks: 1, extraDays: -3 },
];
const raceDate = day(11 * 7 + 7); // the taper ends on day 76, recovery 77–80; 81–83 are free for rest, the vet and the trip

test('days off: a couple absorbed, the rest made up, time to rebuild after a long stop', () => {
  assert.equal(rules.addedDaysFor(0), 0);
  assert.equal(rules.addedDaysFor(rules.ABSORBED_DAYS), 0);
  assert.equal(rules.addedDaysFor(5), 5);
  assert.equal(rules.addedDaysFor(14), 14);
  assert.equal(rules.addedDaysFor(15), 15 + 7);
  assert.equal(rules.addedDaysFor(30), 30 + 14);
});

test('the phases are laid end to end with the days added', () => {
  const phases = cycle();
  phases[1].extraDays = 5;
  const laid = rules.layout(start, phases);
  assert.equal(laid[1].startDate.getTime(), day(28).getTime());
  assert.equal(laid[2].startDate.getTime(), day(28 + 21 + 5).getTime(), 'the phases after move back');
  assert.equal(rules.raceShortfall(start, cycle(), raceDate), 0, 'the plan as made fits its race');
});

test('a phase made longer: the phases ahead are cut to keep the race, the latest first, never below their least', () => {
  const before = cycle();
  const grown = cycle();
  grown[1].extraDays = 6; // strength runs 6 days more
  const fit = rules.fitToRace({ startDate: start, phases: grown, before, raceDate, from: 1 });
  assert.equal(fit.short, 0);
  // The days before the race stay free: speed gives all 6 days, the taper is kept.
  assert.deepEqual(fit.cuts, [{ index: 2, key: 'speed', days: 6 }], 'speed gives the days, the taper is kept');
  assert.equal(rules.raceShortfall(start, fit.phases, raceDate), 0);

  // Too much to make up: speed down to its least, still short — the horse cannot be ready.
  const long = cycle();
  long[1].extraDays = 30;
  const tooLate = rules.fitToRace({ startDate: start, phases: long, before, raceDate, from: 1 });
  assert.equal(tooLate.phases[2].weeks * 7 + tooLate.phases[2].extraDays, rules.MIN_PHASE_DAYS.speed);
  assert.ok(tooLate.short > 0);

  // No race: nothing to keep.
  assert.deepEqual(rules.fitToRace({ startDate: start, phases: long, before, raceDate: null, from: 1 }).cuts, []);
});

test('the checkpoint judges what was due: attendance, targets, rating and the vet for the next phase', () => {
  const now = day(10);
  const at = (n) => day(n);
  const good = [
    { at: at(1), status: 'evaluated', met: true, rating: 8 },
    { at: at(2), status: 'completed', met: true, rating: 7 },
    { at: at(3), status: 'evaluated', met: true, rating: 8 },
    { at: at(4), status: 'evaluated', met: false, rating: 7 },
    { at: at(12), status: 'scheduled' }, // not due yet
  ];
  const pass = rules.phaseVerdict(good, { now });
  assert.equal(pass.due, 4);
  assert.equal(pass.pass, true);

  const poor = [...good, { at: at(5), status: 'missed' }, { at: at(6), status: 'missed' }];
  const fail = rules.phaseVerdict(poor, { now });
  assert.equal(fail.pass, false);
  assert.match(fail.reasons.join(' '), /chuyên cần 4\/6 buổi/);

  const vet = rules.phaseVerdict(good, { now, clearance: { restricted: true, level: 'light', label: 'tập nhẹ' }, nextIntensity: 'high' });
  assert.equal(vet.pass, false, 'the vet allows only light work, the next phase is hard');
  assert.equal(rules.phaseVerdict([], { now }).pass, true, 'nothing to judge: it moves on');
});

test('a checkpoint is due once a build-up phase ended, until it passed or failed; not for the race or recovery', () => {
  const phases = rules.layout(start, cycle());
  assert.equal(rules.checkpointDue(phases, [], day(27)), -1, 'base still running');
  assert.equal(rules.checkpointDue(phases, [], day(28)), 0);
  assert.equal(rules.checkpointDue(phases, [{ phaseIndex: 0, result: 'passed' }], day(28)), -1);
  assert.equal(rules.checkpointDue(phases, [{ phaseIndex: 0, result: 'extended' }], day(28)), 0, 'a week more ran out: judged again');
  assert.equal(rules.checkpointDue(phases, [], day(40)), -1, 'long ended: not judged afterwards');
  assert.equal(rules.checkpointDue(phases, [], day(10 * 7 + 1)), 2, 'speed → taper is judged too');
  assert.equal(rules.checkpointDue(phases, [{ phaseIndex: 2, result: 'passed' }], day(11 * 7)), -1, 'taper → race: the race decision, not a checkpoint');
  assert.equal(rules.extensionsOf([{ phaseIndex: 1, result: 'extended' }, { phaseIndex: 1, result: 'extended' }, { phaseIndex: 0, result: 'extended' }], 1), 2);
});
