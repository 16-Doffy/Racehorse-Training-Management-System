const TrainingPlan = require('../../models/TrainingPlan');
const TrainingSession = require('../../models/TrainingSession');
const RaceEntry = require('../../models/RaceEntry');
const Horse = require('../../models/Horse');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const pick = require('../../utils/pick');
const { getMedicalBlock } = require('./readiness.service');
const { generatePlanWeek, startOfDay, ddmm, DAY_MS } = require('./trainingPlan.service');
const {
  PHASE_LABELS,
  SESSION_KINDS,
  suggestPhases,
  PHASE_DEFAULTS,
  PRESCRIPTION_RANGES,
  rangeProblem,
  kindSpeedProblem,
  SESSION_DONE_STATUSES,
} = require('../../constants/training');

const { phasesOf, currentPhaseIndex } = TrainingPlan;

// What a client may set. createdBy is the caller; the horse can't be swapped on an existing plan,
// since every session under it was planned for that horse.
const CREATE_FIELDS = [
  'horse', 'phase', 'goal', 'targetRace', 'distanceTarget', 'weeklyVolumeKm',
  'intensity', 'surface', 'startDate', 'endDate', 'notes', 'status', 'phases', 'sessionTime',
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
    for (const d of p.week || []) {
      const day = Number(d.day);
      if (!Number.isInteger(day) || day < 0 || day > 6) return { error: `${label}: ngày trong tuần không hợp lệ.` };
      if (seen.has(day)) return { error: `${label}: một ngày chỉ xếp một buổi.` };
      seen.add(day);
      if (!SESSION_KINDS[d.kind]) return { error: `${label}: loại buổi tập không hợp lệ.` };
      const overrides = pick(d, ['distanceM', 'reps', 'targetSpeedKmh', 'targetHeartRateMax']);
      const problem = rangeProblem(overrides, PRESCRIPTION_RANGES) || kindSpeedProblem(d.kind, overrides.targetSpeedKmh);
      if (problem) return { error: `${label}: ${problem}` };
      week.push({ day, kind: d.kind, ...overrides });
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
async function validatePlan({ horse, targetRace, startDate, endDate, phases }) {
  if (!phases?.length && startDate && endDate && new Date(endDate) < new Date(startDate)) {
    return 'Ngày kết thúc không được trước ngày bắt đầu.';
  }
  if (targetRace) {
    // A plan prepares one horse for one of *its* races; pointing it at another horse's entry
    // would make "Hướng tới" name a race this horse isn't running.
    const race = await RaceEntry.findById(targetRace).select('horse');
    if (!race) return 'Không tìm thấy giải đua đã chọn.';
    if (String(race.horse) !== String(horse)) return 'Giải đua đã chọn không phải của ngựa này.';
  }
  return null;
}

/** A horse follows one training cycle at a time. The other active plan, or null. */
async function otherActivePlan(horse, exceptId) {
  return TrainingPlan.findOne({ horse, status: 'active', ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('goal phase startDate');
}
const activeConflict = (horseName, other) =>
  `${horseName} đang theo kế hoạch "${other.goal || PHASE_LABELS[other.phase]}" (từ ${ddmm(other.startDate)}) — hãy hoàn thành hoặc hủy kế hoạch đó trước khi áp dụng kế hoạch mới.`;

/**
 * Where a plan stands today: week n of N, the current phase, how its sessions are going and the
 * next few booked, and days to the race. Also refreshes the flat "current phase" fields, which are
 * only written when the plan is saved.
 */
function withProgress(plan, stats, upcoming) {
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
  };
  return json;
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
    if (s.status === 'scheduled' && new Date(s.scheduledAt).getTime() >= now) {
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
  const { stats, upcoming } = await sessionsByPlan(plans.map((p) => p._id));
  const data = plans.map((p) => withProgress(p, stats.get(String(p._id)), upcoming.get(String(p._id))));
  return ok(res, data, 'Training plans fetched.');
});

const getPlan = asyncHandler(async (req, res) => {
  const plan = await withRefs(TrainingPlan.findById(req.params.id));
  if (!plan) return fail(res, 'Training plan not found.', 404);
  if (!(await canAccessHorse(req.user, plan.horse?._id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  const { stats, upcoming } = await sessionsByPlan([plan._id]);
  return ok(res, withProgress(plan, stats.get(String(plan._id)), upcoming.get(String(plan._id))), 'Training plan fetched.');
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

  let race = null;
  if (targetRace) {
    race = await RaceEntry.findById(targetRace).select('horse raceName raceDate distance');
    if (!race || String(race.horse) !== String(horse)) return fail(res, 'Giải đua đã chọn không phải của ngựa này.', 400);
    if (startOfDay(race.raceDate) <= startDate) return fail(res, 'Ngày đua phải sau ngày bắt đầu kế hoạch.', 400);
  }
  const phases = suggestPhases(startDate, race?.raceDate).map((p) => ({ ...p, distanceTarget: race?.distance || undefined }));
  const other = await otherActivePlan(horse);
  return ok(
    res,
    {
      startDate,
      phases,
      race: race ? { _id: race._id, raceName: race.raceName, raceDate: race.raceDate, distance: race.distance } : null,
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

const createPlan = asyncHandler(async (req, res) => {
  const body = pick(req.body, CREATE_FIELDS);
  if (!(await canAccessHorse(req.user, body.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const blocked = await getMedicalBlock(body.horse);
  if (blocked) return fail(res, `Không thể lập kế hoạch huấn luyện: ${blocked}`, 409);

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
  return created(res, plan, 'Training plan created.');
});

const updatePlan = asyncHandler(async (req, res) => {
  const plan = await TrainingPlan.findById(req.params.id);
  if (!plan) return fail(res, 'Training plan not found.', 404);
  if (!(await canAccessHorse(req.user, plan.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const changes = pick(req.body, UPDATE_FIELDS);
  const phaseError = await preparePhases(changes);
  if (phaseError) return fail(res, phaseError, 400);
  const invalid = await validatePlan({ ...plan.toObject(), ...changes });
  if (invalid) return fail(res, invalid, 400);

  if (changes.status === 'active' && plan.status !== 'active') {
    const other = await otherActivePlan(plan.horse, plan._id);
    if (other) {
      const horse = await Horse.findById(plan.horse).select('name');
      return fail(res, activeConflict(horse?.name || 'Ngựa', other), 409, { activePlan: other._id });
    }
  }

  Object.assign(plan, changes);
  await plan.save();
  // A cycle that ends takes its future bookings with it.
  if (['completed', 'cancelled'].includes(changes.status)) {
    await TrainingSession.updateMany(
      { trainingPlan: plan._id, status: 'scheduled', scheduledAt: { $gte: new Date() } },
      { status: 'cancelled' }
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
