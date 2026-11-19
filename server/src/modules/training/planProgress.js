const clubPolicy = require('../../config/clubPolicy');
const { SESSION_DONE_STATUSES, PHASE_LABELS, PRE_RACE_DAYS } = require('../../constants/training');
const { allows } = require('../health/trainingClearance');

/**
 * How a plan follows the horse rather than only the calendar (the club's choice of 16/11/2026). Pure
 * rules here; planProgress.service.js applies them to the plans.
 *
 * - Stopped by the vet, the plan pauses in the phase it was in. Back at work, that phase runs as many
 *   days longer as were lost (a couple of days are absorbed), plus time to rebuild after a long stop, so
 *   no phase is skipped; the phases after it move back.
 * - Each build-up phase ends with a checkpoint on its own sessions — attendance, targets met, the
 *   trainer's rating — and the vet's clearance for the next phase's work. Only the trainer moves the
 *   horse on, once these are met ("phase done"); a phase that ended without that runs another week,
 *   as many times as it takes: no phase is skipped.
 * - Whenever the phases move, the plan must still be done PRE_RACE_DAYS before the race (rest, the vet's
 *   pre-race check, the trip): the build-up phases still ahead are shortened, the latest first, to no
 *   less than they need. When that is not enough, or a phase
 *   failed, the horse cannot be ready in time and is withdrawn from the race.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// Up to this many days off, the phase absorbs them.
const ABSORBED_DAYS = 2;
// After a longer stop, days to rebuild what was lost on top of the days off (the longest that applies).
const REBUILD = [
  { over: 28, days: 14 },
  { over: 14, days: 7 },
];
// A phase that fails its checkpoint runs this many days more, at most MAX_EXTENSIONS times.
const EXTEND_DAYS = 7;
const MAX_EXTENSIONS = 2;
// The least a build-up phase still ahead may be cut to, to keep the race: what still does its job.
const MIN_PHASE_DAYS = { base_building: 14, strength: 7, speed: 7, peak: 5 };
// The checkpoint looks at a phase that ended at most this long ago: older ones (a plan from before
// checkpoints) are not judged afterwards.
const CHECK_WITHIN_DAYS = 3;
// The trainer may decide on a phase in its last days, or while it runs a week more.
const DECIDE_LAST_DAYS = 3;

const phaseDays = (p) => Math.max(1, (Number(p.weeks) || 0) * 7 + (Number(p.extraDays) || 0));
const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
const label = (key) => PHASE_LABELS[key] || key;

/** Days the paused phase runs longer after `daysOff` days stopped: none, the days, or the days and time to rebuild. */
function addedDaysFor(daysOff) {
  if (!(daysOff > ABSORBED_DAYS)) return 0;
  return daysOff + (REBUILD.find((r) => daysOff > r.over)?.days || 0);
}

/** The phases laid end to end from `startDate`, each its weeks plus the days added (or taken off). */
function layout(startDate, phases) {
  let cursor = startOfDay(startDate).getTime();
  return phases.map((p) => {
    const start = cursor;
    cursor += phaseDays(p) * DAY_MS;
    return { ...p, startDate: new Date(start), endDate: new Date(cursor - 1) };
  });
}

/** The last phase before the race (the taper), or -1. */
function lastBuildUp(phases) {
  for (let i = phases.length - 1; i >= 0; i -= 1) if (phases[i].key !== 'recovery') return i;
  return -1;
}

/**
 * Days the plan — the build-up and the recovery after the trial — runs too late to leave PRE_RACE_DAYS
 * free before the race (0 when it fits, or with no race).
 */
function raceShortfall(startDate, phases, raceDate) {
  if (!raceDate || lastBuildUp(phases) < 0) return 0;
  const laid = layout(startDate, phases);
  const lastDay = startOfDay(laid[laid.length - 1].endDate).getTime();
  const latest = startOfDay(raceDate).getTime() - (PRE_RACE_DAYS + 1) * DAY_MS;
  return Math.max(0, Math.round((lastDay - latest) / DAY_MS));
}

/**
 * Keeps the race where it was against the taper after phase `from` grew: the build-up phases between it
 * and the taper are shortened, the latest first, down to MIN_PHASE_DAYS. Only what the change cost is
 * made up (`before`: the phases as they were — a plan that was already tight is not cut further).
 * Returns { phases, cuts: [{ index, key, days }], short } — `short`: days still missing (0: the race fits).
 */
function fitToRace({ startDate, phases, before = phases, raceDate, from }) {
  const out = phases.map((p) => ({ ...p, extraDays: Number(p.extraDays) || 0 }));
  if (!raceDate) return { phases: out, cuts: [], short: 0 };
  const allowance = raceShortfall(startDate, before, raceDate);
  let short = raceShortfall(startDate, out, raceDate) - allowance;
  const cuts = [];
  for (let j = lastBuildUp(out) - 1; j > from && short > 0; j -= 1) {
    const p = out[j];
    const can = phaseDays(p) - (MIN_PHASE_DAYS[p.key] ?? 7);
    if (can <= 0) continue;
    const cut = Math.min(can, short);
    p.extraDays -= cut;
    short -= cut;
    cuts.push({ index: j, key: p.key, days: cut });
  }
  return { phases: out, cuts, short: Math.max(0, short) };
}

const percent = (share) => `${Math.round(share * 100)}%`;

/**
 * A phase's checkpoint from its sessions ([{ at, status, met, rating }], not those called off) and the
 * vet's clearance for the next phase's work. A session not yet due does not count; a phase with nothing
 * to judge passes. Returns { due, done, rated, met, avgRating, checks: [{ key, label, ok, detail }],
 * pass, reasons }.
 */
function phaseVerdict(sessions = [], { now = new Date(), clearance = null, nextIntensity = null } = {}) {
  const past = sessions.filter((s) => new Date(s.at) < now);
  const doneList = past.filter((s) => SESSION_DONE_STATUSES.includes(s.status));
  const due = doneList.length + past.filter((s) => ['missed', 'aborted'].includes(s.status)).length;
  const rated = doneList.filter((s) => s.met === true || s.met === false);
  const met = rated.filter((s) => s.met === true).length;
  const ratings = doneList.map((s) => Number(s.rating)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 10);
  const avgRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
  const vetOk = !clearance?.restricted || allows(clearance, nextIntensity);
  const checks = [
    {
      key: 'attendance',
      label: `Chuyên cần ≥ ${percent(clubPolicy.raceFormMinDone)}`,
      ok: due ? doneList.length / due >= clubPolicy.raceFormMinDone : null,
      detail: due ? `${doneList.length}/${due} buổi` : 'Chưa có buổi đến hạn',
    },
    {
      key: 'targets',
      label: `Đạt chỉ tiêu ≥ ${percent(clubPolicy.raceFormMinMet)}`,
      ok: rated.length ? met / rated.length >= clubPolicy.raceFormMinMet : null,
      detail: rated.length ? `${met}/${rated.length} buổi` : 'Chưa có buổi có chỉ tiêu',
    },
    {
      key: 'rating',
      label: `Điểm HLV ≥ ${clubPolicy.raceFormMinAvgRating}`,
      ok: avgRating == null ? null : avgRating >= clubPolicy.raceFormMinAvgRating,
      detail: avgRating == null ? 'Chưa chấm điểm' : `Trung bình ${avgRating}`,
    },
    {
      key: 'vet',
      label: 'Bác sĩ cho tập giai đoạn sau',
      ok: vetOk,
      detail: clearance?.restricted ? `Bác sĩ chỉ cho ${clearance.label}` : 'Không hạn chế',
    },
  ];
  const failed = checks.filter((c) => c.ok === false);
  return {
    due,
    done: doneList.length,
    rated: rated.length,
    met,
    avgRating,
    checks,
    pass: failed.length === 0,
    reasons: failed.map((c) => `${c.label.replace(/ ≥.*$/, '').toLowerCase()} ${c.detail.toLowerCase()}`),
  };
}

/**
 * The checkpoint due on a plan now: the build-up phase that just ended (followed by another build-up
 * phase), not yet passed or failed, its extension run out. Returns its index or -1.
 */
function checkpointDue(phases, checkpoints = [], now = new Date()) {
  for (let j = 0; j < phases.length - 1; j += 1) {
    const p = phases[j];
    if (p.key === 'recovery' || phases[j + 1].key === 'recovery') continue;
    const end = new Date(p.endDate);
    if (now <= end || now - end > CHECK_WITHIN_DAYS * DAY_MS) continue;
    const last = checkpoints.filter((c) => c.phaseIndex === j).at(-1);
    if (last && last.result !== 'extended') continue;
    return j;
  }
  return -1;
}

/**
 * Where each build-up phase before the taper stands, for the race: 'passed' (the trainer judged it
 * done), 'current' (being trained, a week more included), 'ahead' (not started) or 'unfinished' (over
 * without being judged done). A horse goes to its race only with all of them passed; the taper ends with
 * the race's trial, which the race decision judges. `phases` with startDate/endDate.
 * [{ index, key, state, at, startDate, endDate }]
 */
function phaseCompletion(phases = [], checkpoints = [], now = new Date()) {
  const taper = lastBuildUp(phases);
  const out = [];
  for (let j = 0; j < taper; j += 1) {
    const p = phases[j];
    if (p.key === 'recovery') continue;
    const passed = checkpoints.filter((c) => c.phaseIndex === j && c.result === 'passed').at(-1);
    const state = passed ? 'passed' : now < new Date(p.startDate) ? 'ahead' : now <= new Date(p.endDate) ? 'current' : 'unfinished';
    out.push({ index: j, key: p.key, state, at: passed?.at || null, startDate: p.startDate, endDate: p.endDate });
  }
  return out;
}

/** How many times a phase already ran a week more. */
const extensionsOf = (checkpoints = [], index) => checkpoints.filter((c) => c.phaseIndex === index && c.result === 'extended').length;

module.exports = {
  DAY_MS,
  ABSORBED_DAYS,
  REBUILD,
  EXTEND_DAYS,
  MAX_EXTENSIONS,
  MIN_PHASE_DAYS,
  DECIDE_LAST_DAYS,
  startOfDay,
  phaseDays,
  daysBetween,
  label,
  addedDaysFor,
  layout,
  raceShortfall,
  fitToRace,
  phaseVerdict,
  checkpointDue,
  phaseCompletion,
  extensionsOf,
};
