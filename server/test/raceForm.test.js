const { test } = require('node:test');
const assert = require('node:assert/strict');
const { raceForm } = require('../src/modules/training/raceForm');

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-10T12:00:00');
const daysFrom = (n) => new Date(now.getTime() + n * DAY);
const run = (n, met = true) => ({ at: daysFrom(-n), status: 'evaluated', met });
const missed = (n) => ({ at: daysFrom(-n), status: 'missed', met: null });
const race = (inDays, status = 'confirmed') => ({ raceName: 'TEST Cup', raceDate: daysFrom(inDays), status });
const ten = Array.from({ length: 10 }, (_, i) => run(i + 1));

test('on form: every session run and met, the trial passed, the vet clear', () => {
  const form = raceForm({ stats: ten, trials: [{ at: daysFrom(-1), met: true }], race: race(7), now });
  assert.equal(form.status, 'ready');
  assert.equal(form.label, 'Đủ điều kiện dự giải');
  assert.deepEqual([form.done, form.due, form.met, form.rated, form.trial], [10, 10, 10, 10, 'passed']);
});

test('on track while the trial is still ahead', () => {
  const form = raceForm({ stats: ten, race: race(20), now });
  assert.equal(form.status, 'on_track');
  assert.match(form.reasons[0], /Còn buổi chạy thử 22\/11/);
});

test('not on form: too few sessions run, too few met, the trial failed or never run', () => {
  const skipped = [...ten.slice(0, 7), missed(8), missed(9), missed(10)];
  assert.match(raceForm({ stats: skipped, race: race(20), now }).reasons.join(' '), /Mới tập 7\/10 buổi đến hạn \(cần từ 80%\)/);
  const poor = [...ten.slice(0, 6), run(7, false), run(8, false), run(9, false), run(10, false)];
  assert.match(raceForm({ stats: poor, race: race(20), now }).reasons.join(' '), /Đạt chỉ tiêu 6\/10 buổi/);
  assert.match(raceForm({ stats: ten, trials: [{ at: daysFrom(-1), met: false }], race: race(7), now }).reasons.join(' '), /Chạy thử cho giải chưa đạt/);
  const noTrial = raceForm({ stats: ten, race: race(3), now });
  assert.equal(noTrial.status, 'not_ready');
  assert.match(noTrial.reasons[0], /Chưa chạy thử cho giải \(lịch chạy thử 05\/11 đã qua\)/);
});

test('the vet\'s word comes first; a session still waiting to start is not held against the horse', () => {
  const blocked = raceForm({ stats: ten, trials: [{ at: daysFrom(-1), met: true }], race: race(7), raceBlock: 'Bác sĩ đang khóa tập: viêm gân.', now });
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.reasons, ['Bác sĩ đang khóa tập: viêm gân.']);
  const waiting = raceForm({ stats: [{ at: daysFrom(-0.1), status: 'scheduled' }], race: race(20), now });
  assert.equal(waiting.status, 'pending');
  assert.equal(waiting.due, 0);
});

test('without a race, only the form; a withdrawn race asks for no trial', () => {
  assert.equal(raceForm({ stats: ten, now }).label, 'Phong độ tốt');
  const withdrawn = raceForm({ stats: ten, race: race(3, 'withdrawn'), now });
  assert.equal(withdrawn.trial, null);
  assert.equal(withdrawn.status, 'ready');
});
