const HealthRecord = require('../../models/HealthRecord');
const Horse = require('../../models/Horse');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { getScopedHorseIds, horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const { notifyHorseStaff } = require('../alerts/notification.service');
const pick = require('../../utils/pick');

const RECORD_FIELDS = ['horse', 'date', 'diagnosis', 'vitalSigns', 'resultStatus', 'notes'];

const listRecords = asyncHandler(async (req, res) => {
  const filter = {};
  const horse = await horseFilter(req.user, req.query.horse);
  if (horse !== undefined) filter.horse = horse;

  const records = await HealthRecord.find(filter)
    .populate('horse', 'name healthStatus')
    .populate('examinedBy', 'name')
    .sort({ date: -1, createdAt: -1 });
  return ok(res, records, 'Health records fetched.');
});

const getRecord = asyncHandler(async (req, res) => {
  const record = await HealthRecord.findById(req.params.id).populate('horse').populate('examinedBy', 'name');
  if (!record) return fail(res, 'Health record not found.', 404);
  if (!(await canAccessHorse(req.user, record.horse?._id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  return ok(res, record, 'Health record fetched.');
});

/** True when `record` is the horse's most recent exam — the only one that speaks for "now". */
async function isLatestRecord(record) {
  const latest = await HealthRecord.findOne({ horse: record.horse }).sort({ date: -1, createdAt: -1 }).select('_id');
  return latest && String(latest._id) === String(record._id);
}

// Examining a horse also updates its overall healthStatus, which is what drives the stable-wide
// status board (eligible / monitoring / injured / quarantined) and the training readiness gates.
const createRecord = asyncHandler(async (req, res) => {
  const body = pick(req.body, RECORD_FIELDS);
  if (!(await canAccessHorse(req.user, body.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const record = await HealthRecord.create({ ...body, examinedBy: req.user._id });
  // A back-dated entry for an old exam must not overwrite the conclusion of a newer one.
  if (await isLatestRecord(record)) {
    await Horse.findByIdAndUpdate(record.horse, { healthStatus: record.resultStatus });
  }
  await logAction({ actorId: req.user._id, action: 'healthRecord.create', targetModel: 'HealthRecord', targetId: record._id });

  return created(res, record, 'Health record created.');
});

const updateRecord = asyncHandler(async (req, res) => {
  const record = await HealthRecord.findById(req.params.id);
  if (!record) return fail(res, 'Health record not found.', 404);
  if (!(await canAccessHorse(req.user, record.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  // The horse an exam was about can't be changed afterwards.
  const { horse, ...changes } = pick(req.body, RECORD_FIELDS);
  Object.assign(record, changes);
  await record.save();

  // Correcting an old exam used to overwrite the horse's current status with that old
  // conclusion, even when a newer exam said otherwise.
  if (changes.resultStatus && (await isLatestRecord(record))) {
    await Horse.findByIdAndUpdate(record.horse, { healthStatus: record.resultStatus });
  }
  await logAction({ actorId: req.user._id, action: 'healthRecord.update', targetModel: 'HealthRecord', targetId: record._id });

  return ok(res, record, 'Health record updated.');
});

// Lets a Head Trainer or Manager flag that a horse needs a vet's attention (e.g. after noticing
// repeated fitness alerts or a performance drop) without them being able to create a HealthRecord
// themselves — that stays Veterinarian-only. Goes to the horse's assigned vet, or to every vet if
// nobody is assigned yet.
const requestExam = asyncHandler(async (req, res) => {
  const { horse: horseId, reason } = req.body;
  if (!horseId) return fail(res, 'horse is required.', 400);
  if (!(await canAccessHorse(req.user, horseId))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const horse = await Horse.findById(horseId).select('name');
  if (!horse) return fail(res, 'Horse not found.', 404);

  await notifyHorseStaff({
    staff: 'vet',
    horse: horse._id,
    type: 'exam_request',
    severity: 'warning',
    message: `🩺 ${req.user.name} yêu cầu kiểm tra sức khỏe cho ${horse.name}${reason ? `: ${reason}` : '.'}`,
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
