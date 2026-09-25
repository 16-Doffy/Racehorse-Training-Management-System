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

/**
 * The Veterinarian's queue of outstanding exam requests.
 *
 * Requests are stored as notifications rather than as their own model, which meant that once the
 * bell was cleared there was no list left to work from — the Head Trainer had no way of knowing
 * whether anyone had picked their request up. This reads the same notifications back as a queue,
 * so the request survives being glanced at.
 */
const listExamRequests = asyncHandler(async (req, res) => {
  const Notification = require('../../models/Notification');

  const requests = await Notification.find({
    type: 'exam_request',
    $or: [{ recipientUser: req.user._id }, { recipientRole: req.user.role }],
  })
    .populate('horse', 'name healthStatus')
    .sort({ createdAt: -1 })
    .limit(100);

  return ok(res, requests, 'Exam requests fetched.');
});

/**
 * Which horses are overdue a check-up, so the vet can work proactively instead of waiting to be
 * asked. A hard training session needs an exam from within CLEARANCE_DAYS; this is the list of
 * horses that would fail that gate (see modules/training/readiness.service.js).
 */
const listClearances = asyncHandler(async (req, res) => {
  const { CLEARANCE_DAYS } = require('../training/readiness.service');
  const DUE_SOON_DAYS = 3;

  const scopedIds = await getScopedHorseIds(req.user);
  const horses = await Horse.find(scopedIds ? { _id: { $in: scopedIds } } : {}).select('name healthStatus');

  const rows = await Promise.all(
    horses.map(async (horse) => {
      const latest = await HealthRecord.findOne({ horse: horse._id })
        .sort({ date: -1, createdAt: -1 })
        .select('date resultStatus diagnosis');

      if (!latest) {
        return { horse, lastExam: null, ageDays: null, status: 'never', validUntil: null };
      }

      const ageDays = Math.floor((Date.now() - new Date(latest.date).getTime()) / (24 * 60 * 60 * 1000));
      const validUntil = new Date(new Date(latest.date).getTime() + CLEARANCE_DAYS * 24 * 60 * 60 * 1000);

      let status = 'valid';
      if (ageDays > CLEARANCE_DAYS) status = 'expired';
      else if (ageDays > CLEARANCE_DAYS - DUE_SOON_DAYS) status = 'due_soon';

      return { horse, lastExam: latest, ageDays, status, validUntil };
    })
  );

  // Worst first: the vet should see what's already lapsed before what's merely approaching.
  const order = { never: 0, expired: 1, due_soon: 2, valid: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status] || (b.ageDays ?? 0) - (a.ageDays ?? 0));

  return ok(res, { clearanceDays: CLEARANCE_DAYS, rows }, 'Clearance status fetched.');
});

module.exports = { listRecords, getRecord, createRecord, updateRecord, requestExam, listExamRequests, listClearances };
