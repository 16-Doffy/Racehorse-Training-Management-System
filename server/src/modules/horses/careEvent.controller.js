const mongoose = require('mongoose');
const Horse = require('../../models/Horse');
const CareEvent = require('../../models/CareEvent');
const { CARE_EVENT_KINDS } = require('../../models/CareEvent');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const { logAction } = require('../audit/audit.service');

// Which careSchedule due date (and its "reminder sent" mark) each kind of care moves.
const CARE_DUE = {
  vaccination: ['nextVaccinationDue', 'vaccinationNotifiedAt'],
  deworming: ['nextDewormingDue', 'dewormingNotifiedAt'],
  farrier: ['nextFarrierDue', 'farrierNotifiedAt'],
  exam: ['nextExamDue', 'examNotifiedAt'],
};
const KIND_LABELS = { vaccination: 'tiêm phòng', deworming: 'tẩy giun', farrier: 'đóng móng' };
const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Sets a care due date and clears its reminder mark, so the care scheduler reminds again for the new date. */
function setCareDue(horse, kind, due) {
  const [field, notified] = CARE_DUE[kind];
  horse.careSchedule[field] = due;
  horse.careSchedule[notified] = null;
}

const validDate = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(new Date(v).getTime());

/** GET /horses/:id/care-events?kind= — newest first, for anyone who can see the horse. */
const listCareEvents = asyncHandler(async (req, res) => {
  if (!(await canAccessHorse(req.user, req.params.id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  const filter = { horse: req.params.id };
  if (req.query.kind) {
    if (!CARE_EVENT_KINDS.includes(req.query.kind)) return fail(res, 'Loại chăm sóc không hợp lệ.', 400);
    filter.kind = req.query.kind;
  }
  const events = await CareEvent.find(filter).populate('performedBy', 'name').sort({ date: -1, createdAt: -1 });
  return ok(res, events, 'Care events fetched.');
});

/**
 * POST /horses/:id/care-events { kind, date, product, batchNumber, dose, note, nextDue } — the vet
 * records care that was done. A vaccine or dewormer must be named. `nextDue` (after `date`) moves
 * the horse's reminder for that kind of care.
 */
const createCareEvent = asyncHandler(async (req, res) => {
  const horse = await Horse.findById(req.params.id);
  if (!horse) return fail(res, 'Horse not found.', 404);
  if (!(await canAccessHorse(req.user, horse._id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const { kind, date, product, batchNumber, dose, note, nextDue } = req.body || {};
  if (!CARE_EVENT_KINDS.includes(kind)) return fail(res, 'Chọn loại chăm sóc: tiêm phòng, tẩy giun hoặc đóng móng.', 400);
  if (!validDate(date)) return fail(res, 'Ngày thực hiện không hợp lệ.', 400);
  const when = new Date(date);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (when > endOfToday) return fail(res, 'Ngày thực hiện không được ở tương lai — đây là việc đã làm.', 400);
  if ((kind === 'vaccination' || kind === 'deworming') && !String(product || '').trim()) {
    return fail(res, `Ghi tên ${kind === 'vaccination' ? 'vắc-xin' : 'thuốc tẩy giun'} đã dùng.`, 400);
  }
  let due = null;
  if (nextDue !== undefined && nextDue !== null && nextDue !== '') {
    if (!validDate(nextDue)) return fail(res, 'Ngày hẹn lần sau không hợp lệ.', 400);
    due = new Date(nextDue);
    if (due <= when) return fail(res, 'Ngày hẹn lần sau phải sau ngày thực hiện.', 400);
  }

  const event = await CareEvent.create({ horse: horse._id, kind, date: when, product, batchNumber, dose, note, nextDue: due, performedBy: req.user._id });
  if (due) {
    setCareDue(horse, kind, due);
    await horse.save();
  }
  await logAction({ actorId: req.user._id, action: 'careEvent.create', targetModel: 'CareEvent', targetId: event._id, metadata: { horse: horse.name, kind, product, nextDue: due } });
  return created(res, await event.populate('performedBy', 'name'), `Đã ghi ${KIND_LABELS[kind]} cho ${horse.name}.`);
});

/**
 * DELETE /horses/:id/care-events/:eventId — undo an entry made by mistake: only its author, within
 * 24 hours. The reminder date it set is left as it is (the vet sets it again if needed).
 */
const deleteCareEvent = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) return fail(res, 'Care event not found.', 404);
  const event = await CareEvent.findOne({ _id: req.params.eventId, horse: req.params.id });
  if (!event) return fail(res, 'Care event not found.', 404);
  if (String(event.performedBy) !== String(req.user._id)) return fail(res, 'Chỉ người ghi mới xóa được mục này.', 403);
  if (Date.now() - event.createdAt.getTime() > DELETE_WINDOW_MS) return fail(res, 'Chỉ xóa được trong 24 giờ sau khi ghi.', 409);
  await event.deleteOne();
  await logAction({ actorId: req.user._id, action: 'careEvent.delete', targetModel: 'CareEvent', targetId: event._id, metadata: { kind: event.kind } });
  return ok(res, { _id: event._id }, 'Care event deleted.');
});

module.exports = { listCareEvents, createCareEvent, deleteCareEvent, setCareDue, CARE_DUE };
