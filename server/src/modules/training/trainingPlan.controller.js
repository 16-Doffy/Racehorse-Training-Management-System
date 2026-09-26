const TrainingPlan = require('../../models/TrainingPlan');
const TrainingSession = require('../../models/TrainingSession');
const RaceEntry = require('../../models/RaceEntry');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const pick = require('../../utils/pick');
const { getMedicalBlock } = require('./readiness.service');

// What a client may set. createdBy is the caller; the horse can't be swapped on an existing plan,
// since every session under it was planned for that horse.
const CREATE_FIELDS = [
  'horse', 'phase', 'goal', 'targetRace', 'distanceTarget', 'weeklyVolumeKm',
  'intensity', 'surface', 'startDate', 'endDate', 'notes', 'status',
];
const UPDATE_FIELDS = CREATE_FIELDS.filter((f) => f !== 'horse');

const withRefs = (query) =>
  query
    .populate('horse', 'name breed healthStatus')
    .populate('createdBy', 'name')
    .populate('targetRace', 'raceName raceDate distance status');

/** Checks that only make sense against the plan as it will be saved. Returns an error or null. */
async function validatePlan({ horse, targetRace, startDate, endDate }) {
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
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

const listPlans = asyncHandler(async (req, res) => {
  const filter = {};
  const horse = await horseFilter(req.user, req.query.horse);
  if (horse !== undefined) filter.horse = horse;

  const plans = await withRefs(TrainingPlan.find(filter)).sort({ createdAt: -1 });
  return ok(res, plans, 'Training plans fetched.');
});

const getPlan = asyncHandler(async (req, res) => {
  const plan = await withRefs(TrainingPlan.findById(req.params.id));
  if (!plan) return fail(res, 'Training plan not found.', 404);
  if (!(await canAccessHorse(req.user, plan.horse?._id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  return ok(res, plan, 'Training plan fetched.');
});

const createPlan = asyncHandler(async (req, res) => {
  const body = pick(req.body, CREATE_FIELDS);
  if (!(await canAccessHorse(req.user, body.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const blocked = await getMedicalBlock(body.horse);
  if (blocked) return fail(res, `Không thể lập kế hoạch huấn luyện: ${blocked}`, 409);

  const invalid = await validatePlan(body);
  if (invalid) return fail(res, invalid, 400);

  const plan = await TrainingPlan.create({ ...body, createdBy: req.user._id });
  await logAction({ actorId: req.user._id, action: 'trainingPlan.create', targetModel: 'TrainingPlan', targetId: plan._id });
  return created(res, plan, 'Training plan created.');
});

const updatePlan = asyncHandler(async (req, res) => {
  const plan = await TrainingPlan.findById(req.params.id);
  if (!plan) return fail(res, 'Training plan not found.', 404);
  if (!(await canAccessHorse(req.user, plan.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const changes = pick(req.body, UPDATE_FIELDS);
  const invalid = await validatePlan({ ...plan.toObject(), ...changes });
  if (invalid) return fail(res, invalid, 400);

  Object.assign(plan, changes);
  await plan.save();
  await logAction({ actorId: req.user._id, action: 'trainingPlan.update', targetModel: 'TrainingPlan', targetId: plan._id });
  return ok(res, plan, 'Training plan updated.');
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

module.exports = { listPlans, getPlan, createPlan, updatePlan, deletePlan };
