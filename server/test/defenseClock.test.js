const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shiftAt, pickShift, waitBefore, nextAfter } = require('../scripts/defenseClock');

// Local times, as the workflow runs with TZ=Asia/Ho_Chi_Minh.
const at = (s) => new Date(`2026-11-04T${s}:00`);
const campaign = (day) => day >= '2026-11-02' && day <= '2026-11-12';
const mins = (ask, from) => Math.round((ask.at - from) / 60000);

test('the clock gives each hour its shift, and a run just before a shift takes it', () => {
  assert.equal(shiftAt(at('01:30')), 'report');
  assert.equal(shiftAt(at('03:10')), 'relay');
  assert.equal(shiftAt(at('04:45')), 'morning');
  assert.equal(shiftAt(at('06:56')), 'morning');
  assert.equal(shiftAt(at('10:39')), 'morning');
  assert.equal(shiftAt(at('10:51')), 'noon'); // a scheduled run that replaced the asked one still takes noon
  assert.equal(shiftAt(at('13:06')), 'noon');
  assert.equal(shiftAt(at('15:45')), 'evening');
  assert.equal(shiftAt(at('21:51')), 'evening');
  assert.equal(shiftAt(at('22:40')), 'report');
});

test('a named shift wins over the clock, an unknown name does not', () => {
  assert.equal(pickShift('evening', at('15:59')), 'evening');
  assert.equal(pickShift('', at('13:06')), 'noon');
  assert.equal(pickShift('lunch', at('13:06')), 'noon');
});

test('a run waits for its shift only when it is close', () => {
  assert.equal(Math.round(waitBefore('noon', at('10:51')) / 60000), 9);
  assert.equal(waitBefore('noon', at('13:06')), 0);
  assert.equal(waitBefore('evening', at('09:00')), null);
  assert.equal(waitBefore('report', at('21:51')), 0);
});

test('each shift asks for the next, so the day runs on time', () => {
  const morning = nextAfter({ shift: 'morning', now: at('10:50'), began: true, hasDay: campaign });
  assert.deepEqual([morning.next, mins(morning, at('10:50'))], ['noon', 0]);
  const noon = nextAfter({ shift: 'noon', now: at('15:50'), began: true, hasDay: campaign });
  assert.deepEqual([noon.next, mins(noon, at('15:50'))], ['evening', 9]);
  const evening = nextAfter({ shift: 'evening', now: at('21:50'), began: true, hasDay: campaign });
  assert.deepEqual([evening.next, mins(evening, at('21:50'))], ['report', 0]);
  const report = nextAfter({ shift: 'report', now: at('21:51'), began: true, hasDay: campaign });
  assert.deepEqual([report.next, mins(report, at('21:51'))], ['relay', 249]);
  const relay = nextAfter({ shift: 'relay', now: new Date('2026-11-05T02:00:30'), began: false, hasDay: campaign });
  assert.equal(relay.next, 'morning');
  assert.equal(relay.at.getTime(), new Date('2026-11-05T04:59:00').getTime());
});

test('a report delayed past midnight still leads to that morning', () => {
  const late = nextAfter({ shift: 'report', now: new Date('2026-11-05T00:30:00'), began: true, hasDay: campaign });
  assert.equal(late.at.getTime(), new Date('2026-11-05T02:00:00').getTime());
  const later = nextAfter({ shift: 'report', now: new Date('2026-11-05T02:40:00'), began: true, hasDay: campaign });
  assert.equal(mins(later, new Date('2026-11-05T02:40:00')), 0);
});

test('nothing is asked for when a shift had already begun, or the campaign is over', () => {
  assert.equal(nextAfter({ shift: 'noon', now: at('10:55'), began: false, hasDay: campaign }), null);
  assert.equal(nextAfter({ shift: 'report', now: new Date('2026-11-12T21:51:00'), began: true, hasDay: campaign }), null);
  assert.equal(nextAfter({ shift: 'relay', now: new Date('2026-11-13T02:00:00'), began: false, hasDay: campaign }), null);
  assert.equal(nextAfter({ shift: 'final', now: new Date('2026-11-13T07:07:00'), began: true, hasDay: campaign }), null);
});

test('no run is asked to wait past what a job may last', () => {
  assert.equal(nextAfter({ shift: 'report', now: at('20:00'), began: true, hasDay: campaign }), null);
});
