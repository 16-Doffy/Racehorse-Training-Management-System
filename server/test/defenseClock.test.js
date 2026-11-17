const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shiftAt, pickShift, waitBefore, nextAfter } = require('../scripts/defenseClock');
const {
  addDays,
  weekDayIndex,
  weeklyCup,
  drillRace,
  TEST_HORSES,
  WORK,
  WEEK_ROTA,
  WEEK_EXTRAS,
  planForDay,
  extrasKeyFor,
} = require('../scripts/defenseData');

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

test('evergreen daily loop chains across midnight and month boundaries indefinitely', () => {
  const always = () => true;
  const endNov = nextAfter({ shift: 'report', now: new Date('2026-11-30T21:52:00'), began: true, hasDay: always });
  assert.equal(endNov.next, 'relay');
  assert.equal(endNov.at.getTime(), new Date('2026-12-01T02:00:00').getTime());
  const firstDec = nextAfter({ shift: 'relay', now: new Date('2026-12-01T02:00:10'), began: false, hasDay: always });
  assert.equal(firstDec.next, 'morning');
  assert.equal(firstDec.at.getTime(), new Date('2026-12-01T04:59:00').getTime());
});

test('weekly 3-shift rota covers Mon–Sun for all 4 test horses without invalid cases', () => {
  assert.equal(WEEK_ROTA.length, 7);
  assert.equal(TEST_HORSES.length, 4);
  // 2026-11-18 is Wednesday (idx 2); 2026-11-22 is Sunday (idx 6); 2026-11-23 is Monday (idx 0).
  assert.equal(weekDayIndex('2026-11-16'), 0);
  assert.equal(weekDayIndex('2026-11-18'), 2);
  assert.equal(weekDayIndex('2026-11-22'), 6);
  assert.equal(weekDayIndex('2026-11-23'), 0);
  assert.equal(addDays('2026-11-29', 2), '2026-12-01');

  assert.deepEqual(weeklyCup('2026-11-18'), { name: 'Cúp Tuần CLB 22/11/2026', date: '2026-11-22' });
  assert.deepEqual(weeklyCup('2026-11-22'), { name: 'Cúp Tuần CLB 22/11/2026', date: '2026-11-22' });
  assert.deepEqual(weeklyCup('2026-11-22', 1), { name: 'Cúp Tuần CLB 29/11/2026', date: '2026-11-29' });
  assert.deepEqual(drillRace('2026-11-29'), { name: 'Cúp Diễn Tập Chấn Thương 01/12', date: '2026-12-01' });

  for (let d = 0; d < 7; d += 1) {
    const day = WEEK_ROTA[d];
    for (const shift of ['morning', 'noon', 'evening']) {
      assert.equal(day[shift].length, TEST_HORSES.length, `day ${d} ${shift} length`);
      for (const code of day[shift]) {
        assert.ok(code === '-' || WORK[code], `unknown WORK code "${code}" on day ${d} ${shift}`);
        if (code === 'trial') {
          assert.equal(shift, 'morning', `trial must only run in morning (day ${d} ${shift})`);
          assert.notEqual(d, 6, 'trials must run before Sunday race day');
        }
      }
    }
  }
  assert.ok(planForDay('2026-11-18', 'morning'));
  assert.equal(extrasKeyFor('2026-11-18', 'morning'), '2/morning');
  for (const key of Object.keys(WEEK_EXTRAS)) {
    const [dStr, shift] = key.split('/');
    const d = Number(dStr);
    assert.ok(Number.isInteger(d) && d >= 0 && d <= 6, `invalid day in WEEK_EXTRAS key ${key}`);
    assert.ok(['morning', 'noon', 'evening'].includes(shift), `invalid shift in WEEK_EXTRAS key ${key}`);
  }
});
