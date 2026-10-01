const HealthRecord = require('../../models/HealthRecord');
const Horse = require('../../models/Horse');
const ExamRequest = require('../../models/ExamRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { getScopedHorseIds, horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const { pushNotification } = require('../alerts/notification.service');
const { openExamRequest } = require('./examRequest.service');
const { resolveIncidentsWithRecord } = require('../stable/incident.service');
const { ROLES } = require('../../constants/roles');
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
  await closeRequestsWithRecord(record, req.user);
  // The same exam answers whatever the groom reported about this horse.
  await resolveIncidentsWithRecord(record, req.user);

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
// themselves — that stays Veterinarian-only. Stored as a request with a status, and announced to
// the horse's assigned vet (or every vet if nobody is assigned yet).
const requestExam = asyncHandler(async (req, res) => {
  const { horse: horseId, reason } = req.body;
  const priority = ['normal', 'high', 'urgent'].includes(req.body.priority) ? req.body.priority : 'normal';
  if (!horseId) return fail(res, 'horse is required.', 400);
  if (!(await canAccessHorse(req.user, horseId))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const horse = await Horse.findById(horseId).select('name');
  if (!horse) return fail(res, 'Horse not found.', 404);

  const request = await openExamRequest({ horse, requestedBy: req.user, reason, priority });
  return created(res, request, 'Exam request sent.');
});

/**
 * Exam requests, as each role needs them: a vet sees the requests for the horses they look after
 * (their working queue); a Head Trainer sees the requests they sent, so they can tell whether
 * anyone has acted on them; the Manager sees all. Optional ?status= (pending | done | cancelled).
 */
const listExamRequests = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === ROLES.VETERINARIAN) {
    const horse = await horseFilter(req.user, req.query.horse);
    if (horse !== undefined) filter.horse = horse;
  } else if (req.user.role === ROLES.HEAD_TRAINER) {
    filter.requestedBy = req.user._id;
  }
  if (req.query.status) filter.status = req.query.status;

  const requests = await ExamRequest.find(filter)
    .populate('horse', 'name healthStatus')
    .populate('requestedBy', 'name role')
    .populate('resolvedBy', 'name')
    .populate('healthRecord', 'resultStatus diagnosis date')
    .sort({ status: -1, createdAt: -1 })
    .limit(100);

  return ok(res, requests, 'Exam requests fetched.');
});

/** A vet closing a request without filing an exam (duplicate, already handled, not needed). */
const resolveExamRequest = asyncHandler(async (req, res) => {
  const request = await ExamRequest.findById(req.params.id).populate('horse', 'name');
  if (!request) return fail(res, 'Exam request not found.', 404);
  if (!(await canAccessHorse(req.user, request.horse._id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  if (request.status !== 'pending') return fail(res, 'Yêu cầu này đã được xử lý.', 409);

  const status = req.body.status === 'done' ? 'done' : 'cancelled';
  Object.assign(request, { status, resolvedBy: req.user._id, resolvedAt: new Date(), resolutionNote: req.body.note });
  await request.save();

  await pushNotification({
    recipientUser: request.requestedBy,
    horse: request.horse._id,
    type: 'exam_request',
    severity: 'info',
    message: `🩺 Bác sĩ ${req.user.name} đã ${status === 'done' ? 'xử lý' : 'đóng'} yêu cầu khám ${request.horse.name}${
      req.body.note ? `: ${req.body.note}` : '.'
    }`,
  });
  return ok(res, request, 'Exam request resolved.');
});

const CONCLUSION_LABELS = { eligible: 'đủ điều kiện', monitoring: 'cần theo dõi', injured: 'chấn thương', quarantined: 'cách ly' };

/**
 * Filing an exam answers every request still open for that horse, and each requester is told what
 * the vet concluded — the trainer who asked is the person most waiting on that answer.
 */
async function closeRequestsWithRecord(record, vet) {
  const open = await ExamRequest.find({ horse: record.horse, status: 'pending' });
  if (open.length === 0) return;

  await ExamRequest.updateMany(
    { _id: { $in: open.map((r) => r._id) } },
    { status: 'done', resolvedBy: vet._id, resolvedAt: new Date(), healthRecord: record._id }
  );

  const horse = await Horse.findById(record.horse).select('name');
  const requesters = [...new Set(open.map((r) => String(r.requestedBy)))];
  for (const userId of requesters) {
    // eslint-disable-next-line no-await-in-loop
    await pushNotification({
      recipientUser: userId,
      horse: record.horse,
      type: 'exam_request',
      severity: record.resultStatus === 'eligible' ? 'info' : 'warning',
      message: `🩺 Bác sĩ ${vet.name} đã khám ${horse?.name || 'ngựa'} theo yêu cầu của bạn — kết luận: ${
        CONCLUSION_LABELS[record.resultStatus]
      }. Chẩn đoán: ${record.diagnosis}`,
    });
  }
}

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

  // A queue by default: the horses that need an exam. ?all=true also includes horses whose
  // clearance is still valid. Each row carries clearanceDays so no second request is needed.
  const visible = req.query.all === 'true' ? rows : rows.filter((r) => r.status !== 'valid');
  return ok(res, visible.map((r) => ({ ...r, clearanceDays: CLEARANCE_DAYS })), 'Clearance status fetched.');
});

module.exports = {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  requestExam,
  listExamRequests,
  resolveExamRequest,
  listClearances,
};
