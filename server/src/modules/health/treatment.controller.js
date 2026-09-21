const Treatment = require('../../models/Treatment');
const Horse = require('../../models/Horse');
const TrainingSession = require('../../models/TrainingSession');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { pushNotification } = require('../alerts/notification.service');
const { ROLES } = require('../../constants/roles');
const { getScopedHorseIds, isHorseInScope } = require('../../utils/horseScope');

const listTreatments = asyncHandler(async (req, res) => {
  const { horse, isTrainingLocked, status } = req.query;
  const scopedIds = await getScopedHorseIds(req.user);
  const filter = {};
  if (horse) {
    filter.horse = isHorseInScope(scopedIds, horse) ? horse : { $in: [] };
  } else if (scopedIds) {
    filter.horse = { $in: scopedIds };
  }
  if (isTrainingLocked !== undefined) filter.isTrainingLocked = isTrainingLocked === 'true';
  if (status) filter.status = status;

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

// Cancels any not-yet-run session for a horse the moment it goes under a training lock — without
// this, a session the Head Trainer scheduled *before* the lock existed just sits there as
// "scheduled"/"in_progress" and nothing stops it from actually being run or evaluated. Returns
// how many were cancelled so the caller can mention it in the notification.
async function cancelPendingSessionsForLock(horseId, actorId) {
  const result = await TrainingSession.updateMany(
    { horse: horseId, status: { $in: ['scheduled', 'in_progress'] } },
    { status: 'cancelled' }
  );
  if (result.modifiedCount > 0) {
    await logAction({
      actorId,
      action: 'trainingSession.auto_cancelled_by_lock',
      targetModel: 'Horse',
      targetId: horseId,
      metadata: { count: result.modifiedCount },
    });
  }
  return result.modifiedCount;
}

async function notifyLockIssued({ horseId, lockReason, actorId }) {
  const horse = await Horse.findById(horseId).select('name');
  const horseName = horse?.name || 'Ngựa';
  const cancelledCount = await cancelPendingSessionsForLock(horseId, actorId);

  const cancelNote = cancelledCount > 0 ? ` Đã tự động hủy ${cancelledCount} buổi tập đã lên lịch trước đó.` : '';
  const message = `🔒 ${horseName} bị khóa huấn luyện khẩn cấp: ${lockReason || 'chỉ định y tế'}.${cancelNote}`;

  return pushNotification({
    recipientRole: ROLES.HEAD_TRAINER,
    horse: horseId,
    type: 'injury_lock',
    severity: 'critical',
    message,
    extraRooms: [`horse:${horseId}`],
  });
}

const createTreatment = asyncHandler(async (req, res) => {
  const scopedIds = await getScopedHorseIds(req.user);
  if (!isHorseInScope(scopedIds, req.body.horse)) {
    return fail(res, 'Forbidden: this horse is not assigned to you.', 403);
  }

  const treatment = await Treatment.create({ ...req.body, prescribedBy: req.user._id });
  await logAction({ actorId: req.user._id, action: 'treatment.create', targetModel: 'Treatment', targetId: treatment._id });

  if (treatment.isTrainingLocked) {
    await notifyLockIssued({ horseId: treatment.horse, lockReason: treatment.lockReason, actorId: req.user._id });
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
    await notifyLockIssued({ horseId: treatment.horse, lockReason, actorId: req.user._id });
  }

  return ok(res, treatment, isTrainingLocked ? 'Training lock issued.' : 'Training lock lifted.');
});

module.exports = { listTreatments, getTreatment, createTreatment, updateTreatment, setTrainingLock };
