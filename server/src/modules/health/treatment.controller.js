const Treatment = require('../../models/Treatment');
const Notification = require('../../models/Notification');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { ROLES } = require('../../constants/roles');

const listTreatments = asyncHandler(async (req, res) => {
  const { horse } = req.query;
  const filter = horse ? { horse } : {};
  const treatments = await Treatment.find(filter)
    .populate('horse', 'name healthStatus')
    .populate('prescribedBy', 'name')
    .sort({ createdAt: -1 });
  return ok(res, treatments, 'Treatments fetched.');
});

const getTreatment = asyncHandler(async (req, res) => {
  const treatment = await Treatment.findById(req.params.id).populate('horse').populate('prescribedBy', 'name');
  if (!treatment) return fail(res, 'Treatment not found.', 404);
  return ok(res, treatment, 'Treatment fetched.');
});

const createTreatment = asyncHandler(async (req, res) => {
  const treatment = await Treatment.create({ ...req.body, prescribedBy: req.user._id });
  await logAction({ actorId: req.user._id, action: 'treatment.create', targetModel: 'Treatment', targetId: treatment._id });

  if (treatment.isTrainingLocked) {
    await Notification.create({
      recipientRole: ROLES.HEAD_TRAINER,
      horse: treatment.horse,
      type: 'injury_lock',
      severity: 'critical',
      message: `Training locked for horse ${treatment.horse}: ${treatment.lockReason || 'medical hold'}.`,
    });
  }

  return created(res, treatment, 'Treatment created.');
});

const updateTreatment = asyncHandler(async (req, res) => {
  const treatment = await Treatment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!treatment) return fail(res, 'Treatment not found.', 404);
  return ok(res, treatment, 'Treatment updated.');
});

// Dedicated emergency endpoint: set/lift the "lock training" order for a horse, independent of a
// full treatment-record edit. This is the action the Vet reaches for in an urgent situation.
const setTrainingLock = asyncHandler(async (req, res) => {
  const { isTrainingLocked, lockReason } = req.body;
  const treatment = await Treatment.findByIdAndUpdate(
    req.params.id,
    { isTrainingLocked, lockReason },
    { new: true, runValidators: true }
  );
  if (!treatment) return fail(res, 'Treatment not found.', 404);

  await logAction({
    actorId: req.user._id,
    action: isTrainingLocked ? 'treatment.lock_training' : 'treatment.unlock_training',
    targetModel: 'Treatment',
    targetId: treatment._id,
    metadata: { lockReason },
  });

  if (isTrainingLocked) {
    await Notification.create({
      recipientRole: ROLES.HEAD_TRAINER,
      horse: treatment.horse,
      type: 'injury_lock',
      severity: 'critical',
      message: `Emergency training lock issued: ${lockReason || 'medical hold'}.`,
    });
  }

  return ok(res, treatment, isTrainingLocked ? 'Training lock issued.' : 'Training lock lifted.');
});

module.exports = { listTreatments, getTreatment, createTreatment, updateTreatment, setTrainingLock };
