const TrainingPlan = require('../../models/TrainingPlan');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');

const listPlans = asyncHandler(async (req, res) => {
  const { horse } = req.query;
  const filter = horse ? { horse } : {};
  const plans = await TrainingPlan.find(filter)
    .populate('horse', 'name breed healthStatus')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
  return ok(res, plans, 'Training plans fetched.');
});

const getPlan = asyncHandler(async (req, res) => {
  const plan = await TrainingPlan.findById(req.params.id).populate('horse').populate('createdBy', 'name');
  if (!plan) return fail(res, 'Training plan not found.', 404);
  return ok(res, plan, 'Training plan fetched.');
});

const createPlan = asyncHandler(async (req, res) => {
  const plan = await TrainingPlan.create({ ...req.body, createdBy: req.user._id });
  await logAction({ actorId: req.user._id, action: 'trainingPlan.create', targetModel: 'TrainingPlan', targetId: plan._id });
  return created(res, plan, 'Training plan created.');
});

const updatePlan = asyncHandler(async (req, res) => {
  const plan = await TrainingPlan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!plan) return fail(res, 'Training plan not found.', 404);
  await logAction({ actorId: req.user._id, action: 'trainingPlan.update', targetModel: 'TrainingPlan', targetId: plan._id });
  return ok(res, plan, 'Training plan updated.');
});

const deletePlan = asyncHandler(async (req, res) => {
  const plan = await TrainingPlan.findByIdAndDelete(req.params.id);
  if (!plan) return fail(res, 'Training plan not found.', 404);
  return ok(res, null, 'Training plan deleted.');
});

module.exports = { listPlans, getPlan, createPlan, updatePlan, deletePlan };
