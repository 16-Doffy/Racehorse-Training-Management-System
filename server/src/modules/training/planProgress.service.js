const TrainingPlan = require('../../models/TrainingPlan');
const TrainingSession = require('../../models/TrainingSession');
const RaceEntry = require('../../models/RaceEntry');
const Horse = require('../../models/Horse');
const { ROLES } = require('../../constants/roles');
const { notifyHorseStaff, pushNotification } = require('../alerts/notification.service');
const { logAction } = require('../audit/audit.service');
const { getMedicalBlock } = require('./readiness.service');
const { getTrainingClearance } = require('../health/trainingClearance');
const rules = require('./planProgress');
const { PRE_RACE_DAYS } = require('../../constants/training');

const { phasesOf, currentPhaseIndex } = TrainingPlan;
const { startOfDay, label, EXTEND_DAYS, MAX_EXTENSIONS, DECIDE_LAST_DAYS, DAY_MS } = rules;
const pad = (n) => String(n).padStart(2, '0');
const ddmm = (d) => `${pad(new Date(d).getDate())}/${pad(new Date(d).getMonth() + 1)}`;
const PLAN_REFS = [
  { path: 'targetRace', select: 'raceName raceDate distance status' },
  { path: 'horse', select: 'name' },
];

/**
 * Applies training/planProgress.js to the plans: a plan pauses while the vet stops the horse and makes
 * up the days once it is back; each build-up phase ends with a checkpoint; and a horse that can no
 * longer be ready for its race is withdrawn from it, with the trainer, the Manager and the owner told.
 * Sessions the plan booked itself follow the phases' new dates.
 */

const plainPhases = (plan) => phasesOf(plan).map((p) => ({ ...p, extraDays: Number(p.extraDays) || 0 }));
const horseOf = (plan) => plan.horse?._id || plan.horse;
const nameOf = (plan) => plan.horse?.name || 'Ngựa';

/** The plan's race when the horse is still to run it, else null. */
function raceAhead(plan, now) {
  const race = plan.targetRace;
  if (!race || typeof race !== 'object' || !race.raceDate) return null;
  if (!['registered', 'confirmed'].includes(race.status)) return null;
  return startOfDay(race.raceDate) >= startOfDay(now) ? race : null;
}

/** Writes the phases' added days back on the plan (its dates are laid out again when it is saved). */
function applyPhases(plan, phases) {
  plan.phases.forEach((p, i) => {
    p.extraDays = phases[i].extraDays;
  });
}

/**
 * The sessions ahead the plan booked itself and nobody changed give way to the phases' new dates, and
 * the plan's weeks ahead are booked again; meals already confirmed for those days follow.
 */
async function rebookAhead(plan, now = new Date()) {
  const stale = await TrainingSession.find({ trainingPlan: plan._id, generated: true, status: 'scheduled', scheduledAt: { $gt: now } }).select('scheduledAt');
  if (stale.length) await TrainingSession.deleteMany({ _id: { $in: stale.map((s) => s._id) } });
  try {
    await plan.populate(PLAN_REFS);
    const { scheduleAhead } = require('./trainingPlan.service');
    await scheduleAhead(plan);
  } catch (err) {
    console.error('[plan-progress] booking again failed:', err.message);
  }
  if (stale.length) await require('../feeding/feedingCalendar.service').followSessions(horseOf(plan), stale.map((s) => s.scheduledAt));
}

/**
 * Withdraws the horse from the plan's race: it cannot be ready in time. The race's trial runs still to
 * come are called off. The trainer, the Manager and the owner are told why; the trainer can still
 * confirm the horse on the race page if it turns out fit. Returns the entry, or null when there was no
 * race to withdraw from.
 */
async function withdrawFromRace(plan, reason, now = new Date()) {
  const raceId = plan.targetRace?._id || plan.targetRace;
  const entry = raceId ? await RaceEntry.findById(raceId) : null;
  if (!entry || !['registered', 'confirmed'].includes(entry.status) || startOfDay(entry.raceDate) < startOfDay(now)) return null;
  const claimed = await RaceEntry.findOneAndUpdate(
    { _id: entry._id, status: entry.status },
    {
      $set: { status: 'withdrawn', decision: { status: 'withdrawn', by: null, at: now, auto: true, reason }, reviewNeeded: false },
      $unset: { reviewReason: 1, reviewFlaggedAt: 1 },
    },
    { new: true }
  );
  if (!claimed) return null;
  if (plan.targetRace && typeof plan.targetRace === 'object') plan.targetRace.status = 'withdrawn';
  await TrainingSession.updateMany(
    { raceEntry: entry._id, status: { $in: ['scheduled', 'ready', 'blocked'] }, scheduledAt: { $gte: now } },
    { status: 'cancelled', cancelSource: 'plan', cancelReason: 'Ngựa đã rút khỏi giải' }
  );
  const horse = await Horse.findById(entry.horse).select('name owner');
  const what = `${entry.raceName} (${ddmm(entry.raceDate)})`;
  const message = `🏁 ${horse?.name || 'Ngựa'} được tự động rút khỏi ${what}: ${reason} Có thể chọn giải khác cho kế hoạch; ngựa kịp thể lực thì vẫn xác nhận lại được ở trang Giải đua.`;
  await notifyHorseStaff({ staff: 'trainer', horse: entry.horse, type: 'race_decision', severity: 'warning', message });
  await pushNotification({ recipientRole: ROLES.MANAGER, horse: entry.horse, type: 'race_decision', severity: 'warning', message });
  if (horse?.owner) {
    await pushNotification({ recipientUser: horse.owner, horse: horse._id, type: 'race_decision', severity: 'warning', message: `🏁 ${horse.name} rút khỏi ${what}: ${reason}` });
  }
  await logAction({ actorId: plan.createdBy, action: 'race.auto_withdrawn', targetModel: 'RaceEntry', targetId: entry._id, metadata: { plan: plan._id, reason } });
  return claimed;
}

/** "Rút ngắn Tốc độ 4 ngày, Sức mạnh 3 ngày để kịp ngày đua." or "". */
const cutsText = (cuts) => (cuts.length ? ` Rút ngắn ${cuts.map((c) => `${label(c.key)} ${c.days} ngày`).join(', ')} để kịp ngày đua.` : '');

/**
 * Phase `index` runs `days` longer; the phases still ahead are cut to keep the race, and the horse is
 * withdrawn when even that is not enough (`why`: what made the phase longer). The caller saves the plan.
 * Returns { cuts, withdrawn, end } — `end`: the phase's new last day.
 */
async function lengthen(plan, index, days, why, now) {
  const phases = plainPhases(plan);
  const grown = phases.map((p, j) => (j === index ? { ...p, extraDays: p.extraDays + days } : p));
  const race = raceAhead(plan, now);
  const fit = rules.fitToRace({ startDate: plan.startDate, phases: grown, before: phases, raceDate: race?.raceDate, from: index });
  applyPhases(plan, fit.phases);
  let withdrawn = null;
  if (race && fit.short > 0) {
    withdrawn = await withdrawFromRace(
      plan,
      `${why}; dù đã rút ngắn các giai đoạn sau tới mức tối thiểu vẫn thiếu ${fit.short} ngày để kế hoạch xong trước ngày đua ${ddmm(race.raceDate)} (cần chừa ${PRE_RACE_DAYS} ngày nghỉ, khám và di chuyển).`,
      now
    );
  }
  const end = rules.layout(plan.startDate, fit.phases)[index].endDate;
  return { cuts: fit.cuts, withdrawn, end };
}

/** Stopped by the vet: the plan waits in the phase it is in. */
async function pause(plan, reason, now) {
  const phases = plainPhases(plan);
  if (now < phases[0].startDate || now > phases.at(-1).endDate) return null;
  const index = currentPhaseIndex(phases, now);
  plan.pause = { since: now, phaseIndex: index, reason };
  await plan.save();
  await notifyHorseStaff({
    staff: 'trainer',
    horse: horseOf(plan),
    type: 'plan_checkpoint',
    severity: 'warning',
    message: `⏸️ Kế hoạch tập của ${nameOf(plan)} tạm dừng ở giai đoạn ${label(phases[index].key)}: ${reason.replace(/\.?$/, '.')} Khi bác sĩ cho tập lại, giai đoạn này kéo dài thêm số ngày đã nghỉ để không bỏ phần nào; nếu không còn kịp ngày đua, ngựa tự rút khỏi giải.`,
  });
  return { paused: true };
}

/**
 * Still stopped: the race is checked against the days already lost. When even going back to work
 * tomorrow would not leave the horse ready in time, it is withdrawn now rather than on the day it is back.
 */
async function keepRace(plan, now) {
  const race = raceAhead(plan, now);
  if (!race) return null;
  const { since, phaseIndex: index, reason } = plan.pause;
  const phases = plainPhases(plan);
  if (!(index >= 0 && index < phases.length)) return null;
  const daysOff = Math.max(0, rules.daysBetween(since, now));
  const added = rules.addedDaysFor(daysOff + 1);
  if (!added) return null;
  const grown = phases.map((p, j) => (j === index ? { ...p, extraDays: p.extraDays + added } : p));
  const fit = rules.fitToRace({ startDate: plan.startDate, phases: grown, before: phases, raceDate: race.raceDate, from: index });
  if (!fit.short) return null;
  const withdrawn = await withdrawFromRace(
    plan,
    `ngựa đã nghỉ ${daysOff} ngày (${String(reason || '').replace(/\.$/, '')}); dù tập lại từ mai, giai đoạn ${label(phases[index].key)} cần thêm ${added} ngày và rút ngắn các giai đoạn sau tới mức tối thiểu vẫn thiếu ${fit.short} ngày trước ngày đua ${ddmm(race.raceDate)}.`,
    now
  );
  return withdrawn ? { withdrawn: true } : null;
}

/** Back at work: the phase it stopped in makes up the days lost (rules.addedDaysFor). */
async function resume(plan, now) {
  const { since, phaseIndex: index, reason } = plan.pause;
  const phases = plainPhases(plan);
  const key = phases[index]?.key;
  const daysOff = Math.max(0, rules.daysBetween(since, now));
  const added = index >= 0 && index < phases.length ? rules.addedDaysFor(daysOff) : 0;
  const rebuild = added ? added - daysOff : 0;
  const why = `nghỉ ${daysOff} ngày nên giai đoạn ${label(key)} cần thêm ${added} ngày`;
  const moved = added ? await lengthen(plan, index, added, why, now) : { cuts: [], withdrawn: null };
  plan.pauses.push({ since, until: now, days: daysOff, phaseIndex: index, phaseKey: key, addedDays: added, reason });
  plan.pause = null;
  await plan.save();
  if (added) await rebookAhead(plan, now);
  const lead = `▶️ ${nameOf(plan)} tập lại sau ${daysOff} ngày nghỉ.`;
  const body = added
    ? ` Giai đoạn ${label(key)} kéo dài thêm ${added} ngày (tới ${ddmm(moved.end)})${rebuild ? `, gồm ${rebuild} ngày lấy lại thể lực` : ''}; các giai đoạn sau lùi theo.${cutsText(moved.cuts)}${moved.withdrawn ? ' Không còn kịp ngày đua: ngựa đã được rút khỏi giải.' : ''}`
    : ' Nghỉ ngắn nên lịch các giai đoạn giữ nguyên.';
  await notifyHorseStaff({ staff: 'trainer', horse: horseOf(plan), type: 'plan_checkpoint', severity: moved.withdrawn ? 'warning' : 'info', message: lead + body });
  return { resumed: true, daysOff, added, cuts: moved.cuts, withdrawn: Boolean(moved.withdrawn) };
}

/** A phase's sessions and the vet's clearance, judged for the next phase (rules.phaseVerdict). */
async function verdictFor(plan, phases, index, now) {
  const p = phases[index];
  const sessions = await TrainingSession.find({ trainingPlan: plan._id, status: { $ne: 'cancelled' }, scheduledAt: { $gte: p.startDate, $lte: p.endDate } })
    .select('scheduledAt status outcome.met performanceRating')
    .lean();
  const clearance = await getTrainingClearance(horseOf(plan));
  return rules.phaseVerdict(
    sessions.map((s) => ({ at: s.scheduledAt, status: s.status, met: s.outcome?.met, rating: s.performanceRating })),
    { now, clearance, nextIntensity: phases[index + 1]?.intensity }
  );
}
const metricsOf = (v) => ({ due: v.due, done: v.done, rated: v.rated, met: v.met, avgRating: v.avgRating });

/**
 * The build-up phase that just ended (rules.checkpointDue) without the trainer judging it done: the horse
 * is not moved on by the calendar. It stays in the phase a week more — whether its sessions met the
 * phase's marks or not — and the trainer is asked to judge it (decideCheckpoint). Each week more is
 * fitted to the race like a stop for illness; when the horse can no longer be ready it leaves the race.
 */
async function checkpoint(plan, now) {
  const phases = plainPhases(plan);
  const index = rules.checkpointDue(phases, plan.checkpoints, now);
  if (index < 0) return null;
  const p = phases[index];
  const next = phases[index + 1];
  const v = await verdictFor(plan, phases, index, now);
  const waiting = v.pass; // met, only the trainer's word is missing
  const reasons = waiting ? ['HLV chưa đánh giá hoàn thành giai đoạn'] : v.reasons;
  const why = waiting ? `hết giai đoạn ${label(p.key)} nhưng HLV chưa đánh giá hoàn thành` : `chưa đạt giai đoạn ${label(p.key)} (${v.reasons.join('; ')})`;
  const moved = await lengthen(plan, index, EXTEND_DAYS, `${why} nên tập thêm`, now);
  plan.checkpoints.push({ phaseIndex: index, phaseKey: p.key, at: now, auto: true, metrics: metricsOf(v), reasons, result: 'extended', extendedDays: EXTEND_DAYS });
  await plan.save();
  await rebookAhead(plan, now);
  const until = ddmm(moved.end);
  await notifyHorseStaff({
    staff: 'trainer',
    horse: horseOf(plan),
    type: 'plan_checkpoint',
    severity: 'warning',
    message: `${waiting ? '⏳' : '⚠️'} ${nameOf(plan)} ${why}: ở lại giai đoạn ${label(p.key)} thêm ${EXTEND_DAYS} ngày (tới ${until}), chưa sang ${label(next.key)}. ${
      waiting ? `HLV vào Kế hoạch huấn luyện, bấm "Hoàn thành giai đoạn" để ngựa sang ${label(next.key)}.` : 'HLV đánh giá lại khi ngựa đạt.'
    }${cutsText(moved.cuts)}${moved.withdrawn ? ' Không còn kịp ngày đua: ngựa đã được rút khỏi giải.' : ''}`,
  });
  return { index, result: 'extended', withdrawn: Boolean(moved.withdrawn) };
}

/**
 * Keeps an active plan in step with its horse (the hourly timetable, and the moments its health
 * changes): pauses it while the vet stops the horse, makes up the days once it is back, and runs the
 * checkpoint of a phase that just ended. `plan`: a document, populated or not. Returns what it did, or null.
 */
async function followPlan(plan, { now = new Date() } = {}) {
  if (!plan || plan.status !== 'active' || !plan.phases?.length) return null;
  await plan.populate(PLAN_REFS);
  const blocked = await getMedicalBlock(horseOf(plan));
  if (blocked) return plan.pause?.since ? keepRace(plan, now) : pause(plan, blocked, now);
  if (plan.pause?.since) return resume(plan, now);
  return checkpoint(plan, now);
}

/** followPlan for the horse's active plan; never fails the caller, whose own change is saved. */
async function followPlanOf(horseId, options) {
  try {
    const plan = await TrainingPlan.findOne({ horse: horseId, status: 'active' });
    return plan ? await followPlan(plan, options) : null;
  } catch (err) {
    console.error(`[plan-progress] could not follow the plan of ${horseId}:`, err.message);
    return null;
  }
}

/**
 * Where the plan's current phase stands for its checkpoint, for the plan page: the next phase, the last
 * day, the sessions so far judged as at the checkpoint (live), the decisions already taken, and whether
 * the trainer may decide now (its last days, or a week more running). Null without a checkpoint ahead.
 * `stats`: the plan's sessions as [{ at, status, met, rating }].
 */
function checkpointView(plan, stats = [], { clearance = null, now = new Date() } = {}) {
  if (plan.status !== 'active') return null;
  const phases = plainPhases(plan);
  const index = currentPhaseIndex(phases, now);
  const p = phases[index];
  const next = phases[index + 1];
  if (!p || !next || p.key === 'recovery' || next.key === 'recovery' || now < phases[0].startDate) return null;
  const inPhase = stats.filter((s) => new Date(s.at) >= p.startDate && new Date(s.at) <= p.endDate);
  const v = rules.phaseVerdict(inPhase, { now, clearance, nextIntensity: next.intensity });
  const history = (plan.checkpoints || []).filter((c) => c.phaseIndex === index);
  const last = history.at(-1);
  const daysLeft = Math.max(0, rules.daysBetween(now, p.endDate));
  return {
    phaseIndex: index,
    phaseKey: p.key,
    nextKey: next.key,
    endDate: p.endDate,
    daysLeft,
    extraDays: p.extraDays,
    checks: v.checks,
    pass: v.pass,
    extensions: rules.extensionsOf(plan.checkpoints, index),
    maxExtensions: MAX_EXTENSIONS,
    decided: last?.result === 'passed' || last?.result === 'failed' ? last.result : null,
    canDecide: !plan.pause?.since && last?.result !== 'passed' && last?.result !== 'failed' && (daysLeft < DECIDE_LAST_DAYS || last?.result === 'extended'),
  };
}

/**
 * The trainer's own checkpoint on the current phase (POST /training/plans/:id/checkpoint), in its last
 * days or while it runs a week more: 'pass' ends it today — its days left go to the next phase, so the
 * phases after keep their dates — and 'extend' runs it a week more (the race is checked as for the
 * system's). Returns { plan, result, withdrawn } or { error, status }.
 */
async function decideCheckpoint({ plan, user, decision, note = '', now = new Date() }) {
  if (!['pass', 'extend'].includes(decision)) return { error: 'Chọn: sang giai đoạn tiếp hoặc tập thêm.', status: 400 };
  if (plan.status !== 'active') return { error: 'Chỉ đánh giá kế hoạch đang áp dụng.', status: 409 };
  if (plan.pause?.since) return { error: 'Kế hoạch đang tạm dừng vì bác sĩ khóa tập — đánh giá khi ngựa tập lại.', status: 409 };
  await plan.populate(PLAN_REFS);
  const view = checkpointView(plan, [], { now });
  if (!view) return { error: 'Giai đoạn hiện tại không có đánh giá chuyển giai đoạn.', status: 409 };
  if (!view.canDecide) {
    return { error: `Đánh giá được trong ${DECIDE_LAST_DAYS} ngày cuối của giai đoạn (từ ${ddmm(new Date(view.endDate.getTime() - (DECIDE_LAST_DAYS - 1) * DAY_MS))}).`, status: 409 };
  }
  const phases = plainPhases(plan);
  const index = view.phaseIndex;
  const v = await verdictFor(plan, phases, index, now);
  // "Phase done" only for a horse that did the phase's work: no step up before it is ready.
  if (decision === 'pass' && !v.pass) {
    return {
      error: `Ngựa chưa hoàn thành giai đoạn ${label(phases[index].key)}: ${v.reasons.join('; ')} — chưa được sang ${label(phases[index + 1].key)}. Cho ngựa tập thêm rồi đánh giá lại.`,
      status: 409,
    };
  }
  const base = { phaseIndex: index, phaseKey: phases[index].key, at: now, auto: false, by: user._id, note: String(note || '').trim().slice(0, 300), metrics: metricsOf(v), reasons: v.reasons };
  let withdrawn = null;
  let cuts = [];
  if (decision === 'pass') {
    const left = view.daysLeft;
    if (left > 0) {
      phases[index].extraDays -= left;
      phases[index + 1].extraDays += left;
      applyPhases(plan, phases);
    }
    plan.checkpoints.push({ ...base, result: 'passed' });
  } else {
    const moved = await lengthen(plan, index, EXTEND_DAYS, `HLV cho tập thêm giai đoạn ${label(phases[index].key)}`, now);
    withdrawn = moved.withdrawn;
    cuts = moved.cuts;
    plan.checkpoints.push({ ...base, result: 'extended', extendedDays: EXTEND_DAYS });
  }
  await plan.save();
  if (decision === 'extend' || view.daysLeft > 0) await rebookAhead(plan, now);
  await logAction({ actorId: user._id, action: `trainingPlan.checkpoint_${decision}`, targetModel: 'TrainingPlan', targetId: plan._id, metadata: { phaseIndex: index, note: base.note || null, cuts, withdrawn: Boolean(withdrawn) } });
  return { plan, result: decision === 'pass' ? 'passed' : 'extended', withdrawn: Boolean(withdrawn), cuts };
}

module.exports = { followPlan, followPlanOf, checkpointView, decideCheckpoint, withdrawFromRace, rebookAhead };
