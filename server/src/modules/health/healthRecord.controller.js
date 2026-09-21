const HealthRecord = require('../../models/HealthRecord');
const Horse = require('../../models/Horse');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { getScopedHorseIds, isHorseInScope } = require('../../utils/horseScope');
const { pushNotification } = require('../alerts/notification.service');
const { ROLES } = require('../../constants/roles');

const listRecords = asyncHandler(async (req, res) => {
  const { horse } = req.query;
  const scopedIds = await getScopedHorseIds(req.user);
  const filter = {};
  if (horse) {
    filter.horse = isHorseInScope(scopedIds, horse) ? horse : { $in: [] };
  } else if (scopedIds) {
    filter.horse = { $in: scopedIds };
  }
  const records = await HealthRecord.find(filter)
    .populate('horse', 'name healthStatus')
    .populate('examinedBy', 'name')
    .sort({ date: -1, createdAt: -1 });
  return ok(res, records, 'Health records fetched.');
});

const getRecord = asyncHandler(async (req, res) => {
  const record = await HealthRecord.findById(req.params.id).populate('horse').populate('examinedBy', 'name');
  if (!record) return fail(res, 'Health record not found.', 404);
  return ok(res, record, 'Health record fetched.');
});

// Examining a horse also updates its overall healthStatus, which is what drives the stable-wide
// status board (eligible / monitoring / injured / quarantined).
const createRecord = asyncHandler(async (req, res) => {
  const scopedIds = await getScopedHorseIds(req.user);
  if (!isHorseInScope(scopedIds, req.body.horse)) {
    return fail(res, 'Forbidden: this horse is not assigned to you.', 403);
  }

  const record = await HealthRecord.create({ ...req.body, examinedBy: req.user._id });

  await Horse.findByIdAndUpdate(record.horse, { healthStatus: record.resultStatus });
  await logAction({ actorId: req.user._id, action: 'healthRecord.create', targetModel: 'HealthRecord', targetId: record._id });

  return created(res, record, 'Health record created.');
});

const updateRecord = asyncHandler(async (req, res) => {
  const record = await HealthRecord.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!record) return fail(res, 'Health record not found.', 404);

  if (req.body.resultStatus) {
    await Horse.findByIdAndUpdate(record.horse, { healthStatus: req.body.resultStatus });
  }

  return ok(res, record, 'Health record updated.');
});

// Lets a Head Trainer or Manager flag that a horse needs a vet's attention (e.g. after noticing
// repeated fitness alerts or a performance drop) without them being able to create a HealthRecord
// themselves — that stays Veterinarian-only. Routes straight to the horse's assigned vet if one
// exists, otherwise broadcasts to the whole Veterinarian role (matches the "unassigned = shared"
// default used everywhere else in horseScope.js).
const requestExam = asyncHandler(async (req, res) => {
  const { horse: horseId, reason } = req.body;
  if (!horseId) return fail(res, 'horse is required.', 400);

  const horse = await Horse.findById(horseId).select('name assignedVet');
  if (!horse) return fail(res, 'Horse not found.', 404);

  const message = `🩺 ${req.user.name} yêu cầu kiểm tra sức khỏe cho ${horse.name}${reason ? `: ${reason}` : '.'}`;

  await pushNotification({
    recipientUser: horse.assignedVet || undefined,
    recipientRole: horse.assignedVet ? undefined : ROLES.VETERINARIAN,
    horse: horse._id,
    type: 'exam_request',
    severity: 'warning',
    message,
  });

  await logAction({
    actorId: req.user._id,
    action: 'healthRecord.request_exam',
    targetModel: 'Horse',
    targetId: horse._id,
    metadata: { reason },
  });

  return ok(res, null, 'Exam request sent.');
});

module.exports = { listRecords, getRecord, createRecord, updateRecord, requestExam };
