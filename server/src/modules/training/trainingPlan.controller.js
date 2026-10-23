const TrainingPlan = require('../../models/TrainingPlan');
const TrainingSession = require('../../models/TrainingSession');
const RaceEntry = require('../../models/RaceEntry');
const Horse = require('../../models/Horse');
const FeedingCalendarDay = require('../../models/FeedingCalendarDay');
const asyncHandler = require('../../utils/asyncHandler');
const clubPolicy = require('../../config/clubPolicy');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { notifyHorseStaff } = require('../alerts/notification.service');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const pick = require('../../utils/pick');
const { getMedicalBlock, getRaceBlock } = require('./readiness.service');
const { raceForm } = require('./raceForm');
const { generatePlanWeek, scheduleAhead, startOfDay, ddmm, DAY_MS, TRIAL_DAYS_BEFORE_RACE } = require('./trainingPlan.service');
const {
  PHASE_LABELS,
  SESSION_KINDS,
  suggestPhases,
  PHASE_DEFAULTS,
  PRESCRIPTION_RANGES,
  rangeProblem,
  kindSpeedProblem,
  SESSION_DONE_STATUSES,
  AFTERNOON_KINDS,
  planWarnings,
  slotTimeProblem,
} = require('../../constants/training');

const { phasesOf, currentPhaseIndex } = TrainingPlan;

// What a client may set. createdBy is the caller; the horse can't be swapped on an existing plan,
// since every session under it was planned for that horse.
const CREATE_FIELDS = [
  'horse', 'phase', 'goal', 'targetRace', 'distanceTarget', 'weeklyVolumeKm',
  'intensity', 'surface', 'startDate', 'endDate', 'notes', 'status', 'phases', 'sessionTime', 'afternoonTime',
];
const UPDATE_FIELDS = CREATE_FIELDS.filter((f) => f !== 'horse');

const PHASE_KEYS = Object.keys(PHASE_LABELS);
const INTENSITIES = ['light', 'moderate', 'high'];
const SURFACES = ['turf', 'dirt', 'synthetic', 'sand'];
const UPCOMING_SHOWN = 3;

const withRefs = (query) =>
  query
    .populate('horse', 'name breed healthStatus')
    .populate('createdBy', 'name')
    .populate('targetRace', 'raceName raceDate distance status');

/** Tidies the phases a client sent. Returns { phases } or { error }. */
function normalizePhases(list) {
  if (!Array.isArray(list) || list.length === 0) return { error: 'Kế hoạch cần ít nhất một giai đoạn.' };
  if (list.length > 8) return { error: 'Tối đa 8 giai đoạn trong một kế hoạch.' };
  const phases = [];
  for (const [i, p] of list.entries()) {
    const label = `Giai đoạn ${i + 1}`;
    if (!p || typeof p !== 'object') return { error: `${label}: dữ liệu không hợp lệ.` };
    if (!PHASE_KEYS.includes(p.key)) return { error: `${label}: loại giai đoạn không hợp lệ.` };
    const weeks = Number(p.weeks);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) return { error: `${label}: số tuần phải từ 1 đến 12.` };
    if (p.intensity && !INTENSITIES.includes(p.intensity)) return { error: `${label}: cường độ không hợp lệ.` };
    if (p.surface && !SURFACES.includes(p.surface)) return { error: `${label}: mặt sân không hợp lệ.` };
    const distance = p.distanceTarget === '' || p.distanceTarget == null ? undefined : Number(p.distanceTarget);
    if (distance !== undefined && !(distance >= 100 && distance <= 6000)) return { error: `${label}: cự ly mục tiêu phải trong khoảng 100–6000 m.` };
    const volume = p.weeklyVolumeKm === '' || p.weeklyVolumeKm == null ? undefined : Number(p.weeklyVolumeKm);
    if (volume !== undefined && !(volume > 0 && volume <= 100)) return { error: `${label}: khối lượng phải trong khoảng 1–100 km/tuần.` };

    const week = [];
    const seen = new Set();
    if (p.week !== undefined && !Array.isArray(p.week)) return { error: `${label}: tuần mẫu không hợp lệ.` };
    for (const d of p.week || []) {
      if (!d || typeof d !== 'object') return { error: `${label}: bài tập trong tuần không hợp lệ.` };
      const day = Number(d.day);
      if (!Number.isInteger(day) || day < 0 || day > 6) return { error: `${label}: ngày trong tuần không hợp lệ.` };
      if (d.slot !== undefined && !['morning', 'afternoon'].includes(d.slot)) return { error: `${label}: buổi trong ngày không hợp lệ.` };
      const slot = d.slot || 'morning';
      // At most a morning and an afternoon session a day.
      if (seen.has(`${day}|${slot}`)) return { error: `${label}: mỗi buổi (sáng/chiều) trong ngày chỉ xếp một bài tập.` };
      seen.add(`${day}|${slot}`);
      if (!SESSION_KINDS[d.kind]) return { error: `${label}: loại buổi tập không hợp lệ.` };
      // The trial is the race's rehearsal: once, over the race distance, booked by the week generator.
      if (d.kind === 'trial') {
        return { error: `${label}: không xếp "Chạy thử" vào lịch tuần mẫu — hệ thống tự xếp một buổi chạy thử đủ cự ly giải ${TRIAL_DAYS_BEFORE_RACE} ngày trước ngày đua.` };
      }
      if (slot === 'afternoon' && clubPolicy.afternoonLightOnly && !AFTERNOON_KINDS.includes(d.kind)) {
        return { error: `${label}: theo quy định CLB, buổi chiều chỉ tập nhẹ (đi bộ hoặc phi chậm) — bài nặng để buổi sáng.` };
      }
      const overrides = pick(d, ['distanceM', 'reps', 'targetSpeedKmh', 'targetHeartRateMax']);
      const problem = rangeProblem(overrides, PRESCRIPTION_RANGES) || kindSpeedProblem(d.kind, overrides.targetSpeedKmh);
      if (problem) return { error: `${label}: ${problem}` };
      week.push({ day, slot, kind: d.kind, ...overrides });
    }
    phases.push({
      key: p.key,
      weeks,
      distanceTarget: distance,
      weeklyVolumeKm: volume ?? PHASE_DEFAULTS[p.key].weeklyVolumeKm,
      intensity: p.intensity || PHASE_DEFAULTS[p.key].intensity,
      surface: p.surface,
      week,
    });
  }
  return { phases };
}

/** Checks that only make sense against the plan as it will be saved. Returns an error or null. */
async function validatePlan({ horse, targetRace, startDate, endDate, phases, distanceTarget, sessionTime, afternoonTime }, { checkPhases = true } = {}) {
  if (!startDate || !Number.isFinite(new Date(startDate).getTime())) return 'Ngày bắt đầu không hợp lệ.';
  if (endDate && !Number.isFinite(new Date(endDate).getTime())) return 'Ngày kết thúc không hợp lệ.';
  const timeProblem = slotTimeProblem(sessionTime, afternoonTime);
  if (timeProblem) return timeProblem;
  if (!phases?.length && startDate && endDate && new Date(endDate) < new Date(startDate)) {
    return 'Ngày kết thúc không được trước ngày bắt đầu.';
  }
  let race = null;
  if (targetRace) {
    // A plan prepares one horse for one of *its* races; pointing it at another horse's entry
    // would make "Hướng tới" name a race this horse isn't running.
    race = await RaceEntry.findById(targetRace).select('horse raceDate distance');
    if (!race) return 'Không tìm thấy giải đua đã chọn.';
    if (String(race.horse) !== String(horse)) return 'Giải đua đã chọn không phải của ngựa này.';
    if (checkPhases && startOfDay(race.raceDate) <= startOfDay(startDate)) return 'Ngày đua phải sau ngày bắt đầu kế hoạch.';
  }
  // A cycle whose race falls outside the build-up, or with recovery before the race, can't work.
  if (checkPhases && phases?.length && startDate) {
    const errors = planWarnings(phases, { startDate, raceDate: race?.raceDate, distance: race?.distance || distanceTarget }).filter((w) => w.level === 'error');
    if (errors.length) return errors.map((e) => e.text).join(' ');
  }
  return null;
}

/** A new cycle starts today or later. */
const startsInPast = (startDate) => startDate && startOfDay(startDate) < startOfDay(new Date());

/** A horse follows one training cycle at a time. The other active plan, or null. */
async function otherActivePlan(horse, exceptId) {
  return TrainingPlan.findOne({ horse, status: 'active', ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('goal phase startDate');
}
const activeConflict = (horseName, other) =>
  `${horseName} đang theo kế hoạch "${other.goal || PHASE_LABELS[other.phase]}" (từ ${ddmm(other.startDate)}) — hãy hoàn thành hoặc hủy kế hoạch đó trước khi áp dụng kế hoạch mới.`;

/**
 * Where a plan stands today: week n of N, the current phase, how its sessions are going and the
 * next few booked, days to the race and whether the horse is on form for it (raceForm.js). Also
 * refreshes the flat "current phase" fields, which are only written when the plan is saved.
 */
function withProgress(plan, stats, upcoming, form = {}) {
  const json = plan.toObject ? plan.toObject() : plan;
  const phases = phasesOf(plan);
  const now = new Date();
  const i = currentPhaseIndex(phases, now);
  const current = phases[i];
  const totalWeeks = phases.reduce((n, p) => n + p.weeks, 0);
  const start = phases[0].startDate;
  const week = Math.min(totalWeeks, Math.max(0, Math.floor((startOfDay(now) - start) / (7 * DAY_MS)) + 1));

  Object.assign(json, {
    phases,
    phase: current.key,
    distanceTarget: current.distanceTarget ?? json.distanceTarget,
    weeklyVolumeKm: current.weeklyVolumeKm ?? json.weeklyVolumeKm,
    intensity: current.intensity ?? json.intensity,
    surface: current.surface ?? json.surface,
  });

  const inPhase = (stats || []).filter((s) => s.at >= current.startDate && s.at <= current.endDate);
  const raceDate = json.targetRace?.raceDate;
  json.progress = {
    week, // 0 = not started yet
    totalWeeks,
    phaseIndex: i,
    phaseWeek: Math.max(0, Math.min(current.weeks, Math.floor((startOfDay(now) - current.startDate) / (7 * DAY_MS)) + 1)),
    started: now >= start,
    ended: now > phases[phases.length - 1].endDate,
    phaseSessions: {
      planned: inPhase.length,
      completed: inPhase.filter((s) => SESSION_DONE_STATUSES.includes(s.status)).length,
      met: inPhase.filter((s) => s.met === true).length,
    },
    totalCompleted: (stats || []).filter((s) => SESSION_DONE_STATUSES.includes(s.status)).length,
    raceInDays: raceDate ? Math.ceil((startOfDay(raceDate) - startOfDay(now)) / DAY_MS) : null,
    upcoming: upcoming || [],
    form: raceForm({ stats, trials: form.trials, race: json.targetRace, raceBlock: form.raceBlock, now }),
  };
  return json;
}

/**
 * What raceForm needs besides the plan's own sessions, for many plans: Map(planId → { trials,
 * raceBlock }). The race's trial runs (linked to the entry, as the race decision counts them), and
 * for an active plan whose race is ahead, why the vet keeps the horse from racing now.
 */
async function formByPlan(plans) {
  const raceIds = plans.map((p) => p.targetRace?._id).filter(Boolean);
  const trials = raceIds.length
    ? await TrainingSession.find({ raceEntry: { $in: raceIds }, status: { $in: SESSION_DONE_STATUSES } })
        .select('raceEntry scheduledAt outcome.met')
        .sort({ scheduledAt: -1 })
        .lean()
    : [];
  const today = startOfDay(new Date());
  const horseOf = (p) => String(p.horse?._id || p.horse);
  const checked = (p) => p.status === 'active' && p.targetRace && new Date(p.targetRace.raceDate) >= today;
  const horses = [...new Set(plans.filter(checked).map(horseOf))];
  const blocks = new Map(await Promise.all(horses.map(async (h) => [h, await getRaceBlock(h)])));
  return new Map(
    plans.map((p) => [
      String(p._id),
      {
        trials: trials.filter((t) => String(t.raceEntry) === String(p.targetRace?._id)).map((t) => ({ at: t.scheduledAt, met: t.outcome?.met ?? null })),
        raceBlock: checked(p) ? blocks.get(horseOf(p)) || null : null,
      },
    ])
  );
}

/** Session stats and the next bookings for many plans in two queries: Map(planId → …). */
async function sessionsByPlan(planIds) {
  const sessions = await TrainingSession.find({ trainingPlan: { $in: planIds }, status: { $ne: 'cancelled' } })
    .select('trainingPlan scheduledAt status outcome.met kind objective intensity sessionType prescription')
    .sort({ scheduledAt: 1 })
    .lean();
  const stats = new Map();
  const upcoming = new Map();
  const now = Date.now();
  for (const s of sessions) {
    const key = String(s.trainingPlan);
    if (!stats.has(key)) stats.set(key, []);
    stats.get(key).push({ at: s.scheduledAt, status: s.status, met: s.outcome?.met });
    if (['scheduled', 'ready', 'blocked'].includes(s.status) && new Date(s.scheduledAt).getTime() >= now) {
      if (!upcoming.has(key)) upcoming.set(key, []);
      const list = upcoming.get(key);
      if (list.length < UPCOMING_SHOWN) list.push(s);
    }
  }
  return { stats, upcoming };
}

const listPlans = asyncHandler(async (req, res) => {
  const filter = {};
  const horse = await horseFilter(req.user, req.query.horse);
  if (horse !== undefined) filter.horse = horse;

  const plans = await withRefs(TrainingPlan.find(filter)).sort({ createdAt: -1 });
  const [{ stats, upcoming }, forms] = await Promise.all([sessionsByPlan(plans.map((p) => p._id)), formByPlan(plans)]);
  const data = plans.map((p) => withProgress(p, stats.get(String(p._id)), upcoming.get(String(p._id)), forms.get(String(p._id))));
  return ok(res, data, 'Training plans fetched.');
});

const getPlan = asyncHandler(async (req, res) => {
  const plan = await withRefs(TrainingPlan.findById(req.params.id));
  if (!plan) return fail(res, 'Training plan not found.', 404);
  if (!(await canAccessHorse(req.user, plan.horse?._id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  const [{ stats, upcoming }, forms] = await Promise.all([sessionsByPlan([plan._id]), formByPlan([plan])]);
  return ok(res, withProgress(plan, stats.get(String(plan._id)), upcoming.get(String(plan._id)), forms.get(String(plan._id))), 'Training plan fetched.');
});

/**
 * GET /training/plans/suggest?horse=&targetRace=&startDate= — the phases to propose for a new
 * cycle (weeks counted back from the race), each with its normal week, plus the race's date and
 * distance so the form can fill itself in.
 */
const suggestPlan = asyncHandler(async (req, res) => {
  const { horse, targetRace } = req.query;
  if (!horse) return fail(res, 'horse is required.', 400);
  if (!(await canAccessHorse(req.user, horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  const startDate = startOfDay(req.query.startDate || new Date());
  if (!Number.isFinite(startDate.getTime())) return fail(res, 'Ngày bắt đầu không hợp lệ.', 400);
  if (startsInPast(startDate)) return fail(res, 'Ngày bắt đầu không được ở quá khứ.', 400);

  let race = null;
  if (targetRace) {
    race = await RaceEntry.findById(targetRace).select('horse raceName raceDate distance');
    if (!race || String(race.horse) !== String(horse)) return fail(res, 'Giải đua đã chọn không phải của ngựa này.', 400);
    if (startOfDay(race.raceDate) <= startDate) return fail(res, 'Ngày đua phải sau ngày bắt đầu kế hoạch.', 400);
  }
  const distance = race?.distance || Number(req.query.distance) || undefined;
  const phases = suggestPhases(startDate, race?.raceDate, distance).map((p) => ({ ...p, distanceTarget: distance }));
  const other = await otherActivePlan(horse);
  return ok(
    res,
    {
      startDate,
      phases,
      race: race ? { _id: race._id, raceName: race.raceName, raceDate: race.raceDate, distance: race.distance } : null,
      warnings: planWarnings(phases, { startDate, raceDate: race?.raceDate, distance }),
      activePlan: other ? { _id: other._id, goal: other.goal, phase: other.phase } : null,
    },
    'Plan suggestion.'
  );
});

async function preparePhases(body) {
  if (body.phases === undefined) return null;
  const { phases, error } = normalizePhases(body.phases);
  if (error) return error;
  body.phases = phases;
  return null;
}

/**
 * Books an active plan's sessions for this week and next straight away (the hourly timetable,
 * realtime/planScheduler.js, does the same later). A failure here leaves the plan saved: the next
 * hourly run tries again.
 */
async function bookAhead(plan) {
  try {
    await plan.populate([{ path: 'targetRace', select: 'raceName raceDate distance status' }, { path: 'horse', select: 'name' }]);
    await scheduleAhead(plan);
  } catch (err) {
    console.error('[plan-scheduler] booking ahead failed:', err.message);
  } finally {
    plan.depopulate('targetRace');
    plan.depopulate('horse');
  }
}

const createPlan = asyncHandler(async (req, res) => {
  const body = pick(req.body, CREATE_FIELDS);
  if (!(await canAccessHorse(req.user, body.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const blocked = await getMedicalBlock(body.horse);
  if (blocked) return fail(res, `Không thể lập kế hoạch huấn luyện: ${blocked}`, 409);

  if (startsInPast(body.startDate)) return fail(res, 'Ngày bắt đầu không được ở quá khứ.', 400);
  const phaseError = await preparePhases(body);
  if (phaseError) return fail(res, phaseError, 400);
  const invalid = await validatePlan(body);
  if (invalid) return fail(res, invalid, 400);

  if ((body.status || 'draft') === 'active') {
    const other = await otherActivePlan(body.horse);
    if (other) {
      const horse = await Horse.findById(body.horse).select('name');
      return fail(res, activeConflict(horse?.name || 'Ngựa', other), 409, { activePlan: other._id });
    }
  }

  const plan = await TrainingPlan.create({ ...body, createdBy: req.user._id });
  await logAction({ actorId: req.user._id, action: 'trainingPlan.create', targetModel: 'TrainingPlan', targetId: plan._id });
  if (plan.status === 'active') await bookAhead(plan);
  return created(res, plan, 'Training plan created.');
});

const updatePlan = asyncHandler(async (req, res) => {
  const plan = await TrainingPlan.findById(req.params.id);
  if (!plan) return fail(res, 'Training plan not found.', 404);
  if (!(await canAccessHorse(req.user, plan.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const changes = pick(req.body, UPDATE_FIELDS);
  if (changes.startDate !== undefined && startsInPast(changes.startDate)) {
    return fail(res, 'Ngày bắt đầu không được ở quá khứ.', 400);
  }
  if (changes.status === 'active' && plan.status !== 'active' && startsInPast(changes.startDate ?? plan.startDate)) {
    return fail(res, 'Ngày bắt đầu không được ở quá khứ — hãy cập nhật ngày trước khi áp dụng kế hoạch.', 400);
  }
  const phaseError = await preparePhases(changes);
  if (phaseError) return fail(res, phaseError, 400);
  // The phases are only re-judged when they, the start or the race change: ending an old plan must
  // not be refused over rules it was created before.
  const invalid = await validatePlan(
    { ...plan.toObject(), ...changes },
    { checkPhases: ['phases', 'startDate', 'targetRace'].some((k) => changes[k] !== undefined) }
  );
  if (invalid) return fail(res, invalid, 400);

  if (changes.status === 'active' && plan.status !== 'active') {
    const other = await otherActivePlan(plan.horse, plan._id);
    if (other) {
      const horse = await Horse.findById(plan.horse).select('name');
      return fail(res, activeConflict(horse?.name || 'Ngựa', other), 409, { activePlan: other._id });
    }
  }

  const activating = changes.status === 'active' && plan.status !== 'active';
  Object.assign(plan, changes);
  await plan.save();
  if (plan.status === 'active' && ['phases', 'startDate', 'endDate', 'sessionTime', 'afternoonTime', 'intensity', 'weeklyVolumeKm'].some((key) => changes[key] !== undefined)
    && await FeedingCalendarDay.exists({ plan: plan._id })) {
    await notifyHorseStaff({ staff: 'trainer', horse: plan.horse, type: 'ration_review', severity: 'warning',
      message: 'Kế hoạch tập đã thay đổi. Mở Khẩu phần ăn để xem và xác nhận lại lịch cho ăn của ngựa.' });
  }
  // A plan put into use, or an active plan whose phases, start or race changed: its weeks ahead now.
  if (plan.status === 'active' && (activating || ['phases', 'startDate', 'targetRace'].some((k) => changes[k] !== undefined))) await bookAhead(plan);
  // Closing a cycle also closes every workout that has not begun, including one whose start
  // time has just passed but whose pre-check/start grace window is still open.
  if (['completed', 'cancelled'].includes(changes.status)) {
    await TrainingSession.updateMany(
      { trainingPlan: plan._id, status: { $in: ['scheduled', 'ready', 'blocked'] } },
      { status: 'cancelled', cancelSource: 'plan' }
    );
  }
  await logAction({ actorId: req.user._id, action: 'trainingPlan.update', targetModel: 'TrainingPlan', targetId: plan._id });
  return ok(res, plan, 'Training plan updated.');
});

/** POST /training/plans/:id/generate-week { weekStart? } — see generatePlanWeek (trainingPlan.service.js). */
const generateWeek = asyncHandler(async (req, res) => {
  const plan = await TrainingPlan.findById(req.params.id).populate('targetRace', 'raceName raceDate distance status').populate('horse', 'name');
  if (!plan) return fail(res, 'Training plan not found.', 404);
  if (!(await canAccessHorse(req.user, plan.horse?._id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  if (plan.status !== 'active') return fail(res, 'Chỉ sinh lịch cho kế hoạch đang áp dụng.', 409);

  const result = await generatePlanWeek({ plan, weekStart: req.body?.weekStart, actor: req.user });
  if (result.error) return fail(res, result.error, 409);
  return created(res, result, `Đã xếp ${result.created.length} buổi tập.`);
});

// A plan with sessions is the record of what the horse was trained on; deleting it would orphan
// those sessions (and their evaluations). Cancelling via status keeps the history.
const deletePlan = asyncHandler(async (req, res) => {
  const plan = await TrainingPlan.findById(req.params.id);
  if (!plan) return fail(res, 'Training plan not found.', 404);
  if (!(await canAccessHorse(req.user, plan.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const sessionCount = await TrainingSession.countDocuments({ trainingPlan: plan._id });
  if (sessionCount > 0) {
    return fail(res, `Kế hoạch đã có ${sessionCount} buổi tập — hãy chuyển sang trạng thái "Đã hủy" thay vì xoá.`, 409);
  }

  await plan.deleteOne();
  await logAction({ actorId: req.user._id, action: 'trainingPlan.delete', targetModel: 'TrainingPlan', targetId: plan._id });
  return ok(res, null, 'Training plan deleted.');
});

module.exports = { listPlans, getPlan, suggestPlan, createPlan, updatePlan, generateWeek, deletePlan };
