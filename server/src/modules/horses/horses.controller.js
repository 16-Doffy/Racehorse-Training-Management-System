const Horse = require('../../models/Horse');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { ROLES } = require('../../constants/roles');

const populatePedigree = [
  { path: 'owner', select: 'name email phone' },
  { path: 'sire', select: 'name breed' },
  { path: 'dam', select: 'name breed' },
];

// Horse Owners only ever see the horses they own; every other role sees the full roster
// since training/health/stable operations span all horses in the club.
const listHorses = asyncHandler(async (req, res) => {
  const filter = req.user.role === ROLES.OWNER ? { owner: req.user._id } : {};
  const horses = await Horse.find(filter).populate(populatePedigree).sort({ name: 1 });
  return ok(res, horses, 'Horses fetched.');
});

const getHorse = asyncHandler(async (req, res) => {
  const horse = await Horse.findById(req.params.id).populate(populatePedigree);
  if (!horse) return fail(res, 'Horse not found.', 404);

  if (req.user.role === ROLES.OWNER && String(horse.owner?._id) !== String(req.user._id)) {
    return fail(res, 'Forbidden: you do not own this horse.', 403);
  }

  return ok(res, horse, 'Horse fetched.');
});

const createHorse = asyncHandler(async (req, res) => {
  const horse = await Horse.create(req.body);
  await logAction({ actorId: req.user._id, action: 'horse.create', targetModel: 'Horse', targetId: horse._id });
  return created(res, horse, 'Horse created.');
});

const updateHorse = asyncHandler(async (req, res) => {
  const horse = await Horse.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!horse) return fail(res, 'Horse not found.', 404);
  await logAction({ actorId: req.user._id, action: 'horse.update', targetModel: 'Horse', targetId: horse._id });
  return ok(res, horse, 'Horse updated.');
});

const deleteHorse = asyncHandler(async (req, res) => {
  const horse = await Horse.findByIdAndDelete(req.params.id);
  if (!horse) return fail(res, 'Horse not found.', 404);
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
