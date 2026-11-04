// When a run of the defense data (defenseData.js, .github/workflows/defense-data.yml) works, and which run it
// asks for when it is done. GitHub starts this repo's schedules 2 to 3.5 hours late and drops many: on 02/11
// and 03/11 the noon shift began at 14:35 and 14:48, so its sessions fell after 16:00 and the day's report
// showed no noon at all. A workflow_dispatch made with the run's own token is the one event GitHub starts at
// once, so each run asks for the next itself:
//   morning 05:00 → noon (asked at the end, waits for 11:00) → evening (asked at 15:59) → report (at once)
//   → relay (asked for 02:00, a job lasts at most 6 hours) → morning (asked at 04:59).
// The schedules stay as a fallback. Only one run holds the queue and a newer waiting run replaces an older
// one, so a scheduled run may take the place of an asked one: a run that starts within LEAD_MIN of a shift
// takes that shift and waits for it, whoever started it.
// Times are local: the workflow sets TZ=Asia/Ho_Chi_Minh.

const START = { morning: '05:00', noon: '11:00', evening: '16:00' };
const LEAD_MIN = 20;
const RELAY_FROM = '02:00';
const ASK = { evening: '15:59', morning: '04:59' };
// The longest a run waits before asking: a job is cut at 6 hours, and the relay's wait (02:00–04:59) is the
// longest planned one.
const MAX_WAIT_MIN = 300;
const SHIFTS = ['morning', 'noon', 'evening', 'report', 'relay', 'final', 'early'];

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();
const dayOf = (d) => d.toLocaleDateString('sv-SE');
const atClock = (day, hhmm) => new Date(`${day}T${hhmm}:00`);
const later = (a, b) => (a > b ? a : b);

/** The shift a run takes at this time when nobody named one. */
function shiftAt(now) {
  const m = minutesOf(now);
  for (const [shift, at] of Object.entries(START)) {
    const start = toMin(at);
    if (m < start && start - m <= LEAD_MIN) return shift;
  }
  if (m < 3 * 60) return 'report'; // a report delayed past midnight is still the day before's
  if (m < toMin(START.morning)) return 'relay';
  if (m < toMin(START.noon)) return 'morning';
  if (m < toMin(START.evening)) return 'noon';
  return m < 22 * 60 ? 'evening' : 'report';
}

/** The shift a run takes: the one it was asked for, else the clock's. */
const pickShift = (named, now) => (SHIFTS.includes(named) ? named : shiftAt(now));

/** How long a run waits before its shift begins: 0 when it is time, null when it is too early to wait. */
function waitBefore(shift, now) {
  if (!START[shift]) return 0;
  const ms = atClock(dayOf(now), START[shift]) - now;
  if (ms <= 0) return 0;
  return ms <= (LEAD_MIN + 10) * 60000 ? ms : null;
}

/**
 * The run to ask for when this one is done, and when: { next, at } or null.
 * began: the shift's work started (a shift found already begun asks for nothing, so runs never loop).
 * hasDay(day): whether the campaign has that day.
 */
function nextAfter({ shift, now, began, hasDay }) {
  const today = dayOf(now);
  let ask = null;
  if (['morning', 'noon', 'evening'].includes(shift)) {
    if (!began) return null;
    if (shift === 'morning') ask = { next: 'noon', at: now };
    if (shift === 'noon') ask = { next: 'evening', at: later(now, atClock(today, ASK.evening)) };
    if (shift === 'evening') ask = { next: 'report', at: now };
  } else if (shift === 'report') {
    const morningDay = now.getHours() < 5 ? today : dayOf(new Date(now.getTime() + 24 * 3600000));
    if (hasDay(morningDay)) ask = { next: 'relay', at: later(now, atClock(morningDay, RELAY_FROM)) };
  } else if (shift === 'relay' && hasDay(today)) {
    ask = { next: 'morning', at: later(now, atClock(today, ASK.morning)) };
  }
  if (!ask || ask.at - now > MAX_WAIT_MIN * 60000) return null;
  return ask;
}

module.exports = { START, LEAD_MIN, shiftAt, pickShift, waitBefore, nextAfter };
