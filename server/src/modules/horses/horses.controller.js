const Horse = require('../../models/Horse');
const User = require('../../models/User');
const TrainingPlan = require('../../models/TrainingPlan');
const TrainingSession = require('../../models/TrainingSession');
const HealthRecord = require('../../models/HealthRecord');
const Treatment = require('../../models/Treatment');
const RaceEntry = require('../../models/RaceEntry');
const StableAssignment = require('../../models/StableAssignment');
const FeedingSchedule = require('../../models/FeedingSchedule');
const DailyTask = require('../../models/DailyTask');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { ROLES } = require('../../constants/roles');
const { getScopedHorseIds, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const { pushNotification } = require('../alerts/notification.service');

const populatePedigree = [
  { path: 'owner', select: 'name email phone' },
  { path: 'sire', select: 'name breed' },
  { path: 'dam', select: 'name breed' },
  { path: 'assignedTrainer', select: 'name' },
  { path: 'assignedVet', select: 'name' },
];

// Being made responsible for a horse is something the person needs to be told, not something
// they should discover by noticing a new row. Fires only for people who weren't already in that
// slot, so re-saving a horse without changing its staffing doesn't re-notify anyone.
const ASSIGNMENT_SLOTS = [
  { field: 'owner', message: (name) => `🐎 Ngựa "${name}" đã được thêm vào câu lạc bộ dưới tên bạn.` },
  { field: 'assignedTrainer', message: (name) => `🐎 Bạn được phân công huấn luyện ngựa "${name}".` },
  { field: 'assignedVet', message: (name) => `🐎 Bạn được phân công theo dõi sức khỏe ngựa "${name}".` },
];

async function notifyNewAssignees(horse, previous = {}) {
  for (const slot of ASSIGNMENT_SLOTS) {
    const nextId = horse[slot.field];
    if (!nextId) continue;
    if (String(previous[slot.field] || '') === String(nextId)) continue;

    // eslint-disable-next-line no-await-in-loop
    await pushNotification({
      recipientUser: nextId,
      horse: horse._id,
      type: 'horse_assigned',
      severity: 'info',
      message: slot.message(horse.name),
    });
  }
}

// Owner/Head Trainer/Veterinarian see only the horses assigned to them; Manager/Groom see the full
// roster (a Groom's worklist is scoped separately via DailyTask.assignedTo).
const listHorses = asyncHandler(async (req, res) => {
  const scopedIds = await getScopedHorseIds(req.user);
  const filter = scopedIds ? { _id: { $in: scopedIds } } : {};
  const horses = await Horse.find(filter).populate(populatePedigree).sort({ name: 1 });
  return ok(res, horses, 'Horses fetched.');
});

const getHorse = asyncHandler(async (req, res) => {
  const horse = await Horse.findById(req.params.id).populate(populatePedigree);
  if (!horse) return fail(res, 'Horse not found.', 404);
  if (!(await canAccessHorse(req.user, horse._id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  return ok(res, horse, 'Horse fetched.');
});

// healthStatus is a clinical conclusion owned by the Veterinarian (health records, injury markers,
// training locks). It gates whether a horse may be trained, so letting the horse-registry endpoints
// write it would let a non-vet clear a horse the vet grounded. careSchedule has its own vet-only
// endpoint. Both are dropped here rather than trusted to the UI not sending them.
function withoutClinicalFields(body) {
  const { healthStatus, careSchedule, ...rest } = body || {};
  return rest;
}

// Each staffing slot must point at an active account with the matching role. Otherwise a groom
// could be made a horse's "trainer", or a deactivated vet left as the only one who can see it.
const SLOT_ROLES = { owner: ROLES.OWNER, assignedTrainer: ROLES.HEAD_TRAINER, assignedVet: ROLES.VETERINARIAN };
const SLOT_LABELS = { owner: 'Chủ sở hữu', assignedTrainer: 'HLV phụ trách', assignedVet: 'Bác sĩ phụ trách' };

async function validateStaffing(body) {
  for (const [field, role] of Object.entries(SLOT_ROLES)) {
    if (!body[field]) continue;
    // eslint-disable-next-line no-await-in-loop
    const valid = await User.exists({ _id: body[field], role, isActive: true });
    if (!valid) return `${SLOT_LABELS[field]} phải là tài khoản đúng vai trò và đang hoạt động.`;
  }
  return null;
}

const createHorse = asyncHandler(async (req, res) => {
  const body = withoutClinicalFields(req.body);
  const invalid = await validateStaffing(body);
  if (invalid) return fail(res, invalid, 400);

  const horse = await Horse.create(body);
  await logAction({ actorId: req.user._id, action: 'horse.create', targetModel: 'Horse', targetId: horse._id });
  await notifyNewAssignees(horse);
  return created(res, horse, 'Horse created.');
});

const updateHorse = asyncHandler(async (req, res) => {
  // Read the current staffing first so only genuinely new assignees get notified.
  const before = await Horse.findById(req.params.id).select('owner assignedTrainer assignedVet');
  if (!before) return fail(res, 'Horse not found.', 404);

  const body = withoutClinicalFields(req.body);
  const invalid = await validateStaffing(body);
  if (invalid) return fail(res, invalid, 400);

  const horse = await Horse.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  await logAction({ actorId: req.user._id, action: 'horse.update', targetModel: 'Horse', targetId: horse._id });
  await notifyNewAssignees(horse, {
    owner: before.owner,
    assignedTrainer: before.assignedTrainer,
    assignedVet: before.assignedVet,
  });
  return ok(res, horse, 'Horse updated.');
});

/**
 * Removes a horse registered by mistake. A horse with training or medical history can't be
 * deleted — those records are the club's evidence of what was done to it, and deleting the horse
 * left them pointing at nothing. For a clean removal, its stall, rations and outstanding tasks go
 * with it; before, the stall stayed and the feeding generator kept creating tasks for a horse
 * that no longer existed.
 */
const deleteHorse = asyncHandler(async (req, res) => {
  const horse = await Horse.findById(req.params.id);
  if (!horse) return fail(res, 'Horse not found.', 404);

  const [sessions, records, treatments, races] = await Promise.all([
    TrainingSession.countDocuments({ horse: horse._id }),
    HealthRecord.countDocuments({ horse: horse._id }),
    Treatment.countDocuments({ horse: horse._id }),
    RaceEntry.countDocuments({ horse: horse._id }),
  ]);
  if (sessions + records + treatments + races > 0) {
    return fail(
      res,
      `Không thể xoá: ngựa đã có ${sessions} buổi tập, ${records} hồ sơ khám, ${treatments} phác đồ và ${races} lượt đăng ký giải. Đây là hồ sơ cần lưu giữ.`,
      409
    );
  }

  await Promise.all([
    StableAssignment.deleteMany({ horse: horse._id }),
    FeedingSchedule.deleteMany({ horse: horse._id }),
    TrainingPlan.deleteMany({ horse: horse._id }),
    DailyTask.deleteMany({ horse: horse._id, status: 'pending' }),
  ]);
  await horse.deleteOne();
  await logAction({ actorId: req.user._id, action: 'horse.delete', targetModel: 'Horse', targetId: horse._id });
  return ok(res, null, 'Horse deleted.');
});

// Veterinarian sets/updates the recurring care due-dates (vaccination, deworming, farrier).
// Setting a new due date also clears that item's *NotifiedAt so the scheduler will remind again
// once the new date falls due, instead of staying silent because of the old reminder record.
const updateCareSchedule = asyncHandler(async (req, res) => {
  const { nextVaccinationDue, nextDewormingDue, nextFarrierDue } = req.body;
  const horse = await Horse.findById(req.params.id);
  if (!horse) return fail(res, 'Horse not found.', 404);
  if (!(await canAccessHorse(req.user, horse._id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  if (nextVaccinationDue !== undefined) {
    horse.careSchedule.nextVaccinationDue = nextVaccinationDue;
    horse.careSchedule.vaccinationNotifiedAt = null;
  }
  if (nextDewormingDue !== undefined) {
    horse.careSchedule.nextDewormingDue = nextDewormingDue;
    horse.careSchedule.dewormingNotifiedAt = null;
  }
  if (nextFarrierDue !== undefined) {
    horse.careSchedule.nextFarrierDue = nextFarrierDue;
    horse.careSchedule.farrierNotifiedAt = null;
  }

  await horse.save();
  await logAction({ actorId: req.user._id, action: 'horse.update_care_schedule', targetModel: 'Horse', targetId: horse._id });
  return ok(res, horse, 'Care schedule updated.');
});

module.exports = { listHorses, getHorse, createHorse, updateHorse, deleteHorse, updateCareSchedule };
