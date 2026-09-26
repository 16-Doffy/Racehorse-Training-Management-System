const Treatment = require('../../models/Treatment');
const HealthRecord = require('../../models/HealthRecord');
const Horse = require('../../models/Horse');
const TrainingSession = require('../../models/TrainingSession');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { notifyHorseStaff } = require('../alerts/notification.service');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const pick = require('../../utils/pick');
const { syncHorseHealthStatus } = require('./injuryMarker.controller');

const TREATMENT_FIELDS = ['healthRecord', 'horse', 'medications', 'isTrainingLocked', 'lockReason', 'startDate', 'endDate', 'status'];

const listTreatments = asyncHandler(async (req, res) => {
  const { isTrainingLocked, status } = req.query;
  const filter = {};
  const horse = await horseFilter(req.user, req.query.horse);
  if (horse !== undefined) filter.horse = horse;
  if (isTrainingLocked !== undefined) filter.isTrainingLocked = isTrainingLocked === 'true';
  if (status) filter.status = status;

  const treatments = await Treatment.find(filter)
    .populate('horse', 'name healthStatus')
    .populate('prescribedBy', 'name')
    .sort({ createdAt: -1 });
  return ok(res, treatments, 'Treatments fetched.');
});

async function loadTreatment(req, res) {
  const treatment = await Treatment.findById(req.params.id);
  if (!treatment) {
    fail(res, 'Treatment not found.', 404);
    return null;
  }
  if (!(await canAccessHorse(req.user, treatment.horse))) {
    fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
    return null;
  }
  return treatment;
}

const getTreatment = asyncHandler(async (req, res) => {
  const treatment = await loadTreatment(req, res);
  if (!treatment) return undefined;
  await treatment.populate([{ path: 'horse' }, { path: 'prescribedBy', select: 'name' }]);
  return ok(res, treatment, 'Treatment fetched.');
});

// Cancels any not-yet-run session for a horse the moment it goes under a training lock — without
// this, a session the Head Trainer scheduled *before* the lock existed just sits there as
// "scheduled"/"in_progress" and nothing stops it from actually being run or evaluated.
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

/**
 * Side effects of a lock being issued or lifted, whichever route did it.
 *
 * The generic treatment edit (the vet's edit form has a lock checkbox) used to change the flag
 * directly, so a lock set that way cancelled nothing and told nobody, and a lock lifted that way
 * left no audit entry. Both routes now end here.
 */
async function onLockChanged(treatment, { wasLocked, actor }) {
  const isLocked = treatment.isTrainingLocked && treatment.status === 'ongoing';
  if (isLocked === wasLocked) return;

  const horse = await Horse.findById(treatment.horse).select('name');
  const horseName = horse?.name || 'Ngựa';

  await logAction({
    actorId: actor._id,
    action: isLocked ? 'treatment.lock_training' : 'treatment.unlock_training',
    targetModel: 'Treatment',
    targetId: treatment._id,
    metadata: { lockReason: treatment.lockReason },
  });

  if (isLocked) {
    const cancelled = await cancelPendingSessionsForLock(treatment.horse, actor._id);
    const cancelNote = cancelled > 0 ? ` Đã tự động hủy ${cancelled} buổi tập đã lên lịch trước đó.` : '';
    await notifyHorseStaff({
      staff: 'trainer',
      horse: treatment.horse,
      type: 'injury_lock',
      severity: 'critical',
      message: `🔒 ${horseName} bị khóa huấn luyện khẩn cấp: ${treatment.lockReason || 'chỉ định y tế'}.${cancelNote}`,
      extraRooms: [`horse:${treatment.horse}`],
    });
    return;
  }

  // Lifting a lock matters to the trainer as much as issuing one: without a word, a horse the vet
  // has cleared just sits unscheduled until someone happens to notice.
  await syncHorseHealthStatus(treatment.horse);
  const stillLocked = await Treatment.exists({ horse: treatment.horse, isTrainingLocked: true, status: 'ongoing' });
  await notifyHorseStaff({
    staff: 'trainer',
    horse: treatment.horse,
    type: 'training_unlocked',
    severity: 'info',
    message: stillLocked
      ? `🔓 Bác sĩ đã gỡ một lệnh khóa của ${horseName}, nhưng ngựa vẫn còn lệnh khóa khác.`
      : `🔓 ${horseName} đã được bác sĩ gỡ khóa huấn luyện — có thể xếp lịch tập lại.`,
    extraRooms: [`horse:${treatment.horse}`],
  });
}

const createTreatment = asyncHandler(async (req, res) => {
  const body = pick(req.body, TREATMENT_FIELDS);
  if (!(await canAccessHorse(req.user, body.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  // A treatment follows from an exam of the same horse.
  const record = await HealthRecord.findById(body.healthRecord).select('horse');
  if (!record) return fail(res, 'Không tìm thấy hồ sơ khám.', 404);
  if (String(record.horse) !== String(body.horse)) return fail(res, 'Hồ sơ khám không thuộc ngựa này.', 400);

  const treatment = await Treatment.create({ ...body, prescribedBy: req.user._id });
  await logAction({ actorId: req.user._id, action: 'treatment.create', targetModel: 'Treatment', targetId: treatment._id });
  await onLockChanged(treatment, { wasLocked: false, actor: req.user });

  return created(res, treatment, 'Treatment created.');
});

const updateTreatment = asyncHandler(async (req, res) => {
  const treatment = await loadTreatment(req, res);
  if (!treatment) return undefined;

  const wasLocked = treatment.isTrainingLocked && treatment.status === 'ongoing';
  // The horse and the exam it came from are fixed once the treatment exists.
  const { horse, healthRecord, ...changes } = pick(req.body, TREATMENT_FIELDS);
  Object.assign(treatment, changes);
  await treatment.save();

  await logAction({ actorId: req.user._id, action: 'treatment.update', targetModel: 'Treatment', targetId: treatment._id });
  // Completing a locked treatment ends the lock too, so it counts as lifting it.
  await onLockChanged(treatment, { wasLocked, actor: req.user });
  return ok(res, treatment, 'Treatment updated.');
});

// Dedicated emergency endpoint: set/lift the "lock training" order for a horse, independent of a
// full treatment-record edit. This is the action the Vet reaches for in an urgent situation.
const setTrainingLock = asyncHandler(async (req, res) => {
  const treatment = await loadTreatment(req, res);
  if (!treatment) return undefined;

  const wasLocked = treatment.isTrainingLocked && treatment.status === 'ongoing';
  treatment.isTrainingLocked = Boolean(req.body.isTrainingLocked);
  if (req.body.lockReason !== undefined) treatment.lockReason = req.body.lockReason;
  await treatment.save();

  await onLockChanged(treatment, { wasLocked, actor: req.user });
  return ok(res, treatment, treatment.isTrainingLocked ? 'Training lock issued.' : 'Training lock lifted.');
});

module.exports = { listTreatments, getTreatment, createTreatment, updateTreatment, setTrainingLock };
