const Horse = require('../../models/Horse');
const TrainingSession = require('../../models/TrainingSession');
const HealthRecord = require('../../models/HealthRecord');
const Treatment = require('../../models/Treatment');
const DailyTask = require('../../models/DailyTask');
const ExamRequest = require('../../models/ExamRequest');
const RaceEntry = require('../../models/RaceEntry');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, fail } = require('../../utils/apiResponse');
const { canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const { OBJECTIVE_LABELS } = require('../../constants/training');

/**
 * One horse, everything every role did to it, in order.
 *
 * Each role's screens show that role's own slice — sessions for the trainer, exams for the vet,
 * chores for the groom — so the way one feeds into the next (the groom reports the horse off its
 * feed, the vet examines it and locks it, the trainer's session is cancelled) was only visible by
 * opening three screens as three people. This puts those records on one line of time.
 */

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;
const UPCOMING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const SESSION_STATUS = { scheduled: 'đã lên lịch', in_progress: 'đang diễn ra', completed: 'đã hoàn thành', cancelled: 'đã hủy' };
const HEALTH_STATUS = { eligible: 'đủ điều kiện', monitoring: 'cần theo dõi', injured: 'chấn thương', quarantined: 'cách ly' };
const TASK_LABELS = {
  feeding: 'Cho ăn',
  cleaning: 'Vệ sinh chuồng',
  bathing: 'Tắm rửa',
  icing: 'Ngâm chân nước đá',
  medication: 'Cho dùng thuốc',
  monitoring: 'Theo dõi theo y lệnh',
};
const MEAL_LABELS = { morning: 'bữa sáng', noon: 'bữa trưa', evening: 'bữa chiều' };
const APPETITE = { full: 'ăn hết', partial: 'ăn dở', refused: 'BỎ ĂN' };
const MANURE = { normal: 'phân bình thường', dry: 'phân khô', loose: 'phân lỏng', none: 'không thấy phân' };
const WATER = { normal: 'uống bình thường', high: 'uống nhiều', low: 'uống ít' };
const INCIDENT_STATUS = { open: 'chưa xử lý', acknowledged: 'bác sĩ đã tiếp nhận', resolved: 'đã xử lý' };
const REQUEST_STATUS = { pending: 'đang chờ bác sĩ', done: 'đã khám', cancelled: 'đã đóng' };
const RACE_STATUS = { registered: 'đã đăng ký', confirmed: 'đã xác nhận', completed: 'đã thi đấu', withdrawn: 'đã rút' };

const join = (parts) => parts.filter(Boolean).join(' · ');

function sessionEvents(sessions) {
  return sessions.map((s) => {
    const p = s.prescription || {};
    const plan = join([
      p.distanceM && `${p.distanceM} m`,
      p.targetSpeedKmh && `mục tiêu ${p.targetSpeedKmh} km/h`,
      p.targetHeartRateMax && `nhịp tim ≤ ${p.targetHeartRateMax} bpm`,
    ]);
    return {
      at: s.scheduledAt,
      kind: 'session',
      role: 'head_trainer',
      title: `Buổi tập "${OBJECTIVE_LABELS[s.objective] || 'huấn luyện'}" — ${SESSION_STATUS[s.status] || s.status}`,
      detail: join([
        plan,
        s.outcome?.summary,
        s.readiness?.overrideReason && `HLV vẫn cho tập dù có cảnh báo: ${s.readiness.overrideReason}`,
        s.trainerComment && `Nhận xét: ${s.trainerComment}`,
      ]),
      severity: s.status === 'cancelled' || s.outcome?.met === false || s.readiness?.overrideReason ? 'warning' : 'info',
      refId: s._id,
    };
  });
}

function examEvents(records) {
  return records.map((r) => ({
    at: r.date,
    kind: 'exam',
    role: 'veterinarian',
    actor: r.examinedBy?.name,
    title: `Khám sức khỏe — kết luận: ${HEALTH_STATUS[r.resultStatus] || r.resultStatus}`,
    detail: join([r.diagnosis, r.notes]),
    severity: r.resultStatus === 'eligible' ? 'info' : r.resultStatus === 'monitoring' ? 'warning' : 'critical',
    refId: r._id,
  }));
}

function treatmentEvents(treatments) {
  return treatments.map((t) => ({
    at: t.startDate || t.createdAt,
    kind: 'treatment',
    role: 'veterinarian',
    actor: t.prescribedBy?.name,
    title: t.isTrainingLocked
      ? `Điều trị kèm KHÓA HUẤN LUYỆN${t.status === 'completed' ? ' (đã kết thúc)' : ''}`
      : `Phác đồ điều trị${t.status === 'completed' ? ' (đã kết thúc)' : ''}`,
    detail: join([
      t.lockReason && `Lý do khóa: ${t.lockReason}`,
      t.medications?.length && `Thuốc: ${t.medications.map((m) => join([m.name, m.dosage])).join('; ')}`,
      t.careInstructions && `Y lệnh chăm sóc: ${t.careInstructions}`,
    ]),
    severity: t.isTrainingLocked && t.status === 'ongoing' ? 'critical' : 'info',
    refId: t._id,
  }));
}

function careEvents(tasks) {
  return tasks.map((t) => {
    const o = t.observation || {};
    const origin = { vet: 'theo y lệnh bác sĩ', system: t.trainingSession ? 'sau buổi tập' : null }[t.source];
    const abnormal = o.appetite === 'refused' || o.manure === 'loose' || o.manure === 'none';
    return {
      at: t.completedAt,
      kind: 'care',
      role: 'groom',
      actor: t.assignedTo?.name,
      title: join([`${TASK_LABELS[t.taskType] || t.taskType}${t.mealSlot ? ` ${MEAL_LABELS[t.mealSlot]}` : ''}`, origin]),
      detail: join([t.note, APPETITE[o.appetite], MANURE[o.manure], WATER[o.waterIntake], o.behaviourNote]),
      severity: abnormal ? 'warning' : 'info',
      refId: t._id,
    };
  });
}

function incidentEvents(tasks) {
  return tasks.map((t) => {
    const r = t.incidentReport;
    const status = r.status || 'open';
    return {
      at: r.reportedAt,
      kind: 'incident',
      role: 'groom',
      actor: t.assignedTo?.name,
      title: `Báo sự cố: ${r.description}`,
      detail: join([`Trạng thái: ${INCIDENT_STATUS[status]}`, r.response && `Bác sĩ: ${r.response}`]),
      severity: status === 'resolved' ? 'info' : r.severity === 'high' ? 'critical' : 'warning',
      refId: t._id,
    };
  });
}

function requestEvents(requests) {
  return requests.map((r) => ({
    at: r.createdAt,
    kind: 'exam_request',
    role: r.requestedBy?.role || 'head_trainer',
    actor: r.trainingSession ? 'Hệ thống' : r.requestedBy?.name,
    title: `Yêu cầu bác sĩ khám — ${REQUEST_STATUS[r.status] || r.status}`,
    detail: join([r.reason, r.resolutionNote]),
    severity: r.status === 'pending' ? 'warning' : 'info',
    refId: r._id,
  }));
}

function raceEvents(entries) {
  return entries.map((e) => ({
    at: e.raceDate,
    kind: 'race',
    role: 'head_trainer',
    actor: e.registeredBy?.name,
    title: `Giải đua "${e.raceName}" — ${RACE_STATUS[e.status] || e.status}`,
    detail: join([e.distance && `${e.distance} m`, e.result && `Kết quả: ${e.result}`]),
    severity: 'info',
    refId: e._id,
  }));
}

// GET /horses/:id/timeline?days=14 — newest first; also shows what is booked for the week ahead.
const getTimeline = asyncHandler(async (req, res) => {
  const horse = await Horse.findById(req.params.id).select('name healthStatus');
  if (!horse) return fail(res, 'Horse not found.', 404);
  if (!(await canAccessHorse(req.user, horse._id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const days = Math.min(Math.max(parseInt(req.query.days, 10) || DEFAULT_DAYS, 1), MAX_DAYS);
  const from = new Date(Date.now() - days * DAY_MS);
  const to = new Date(Date.now() + UPCOMING_DAYS * DAY_MS);
  const h = horse._id;

  const [sessions, records, treatments, care, incidents, requests, races] = await Promise.all([
    TrainingSession.find({ horse: h, scheduledAt: { $gte: from, $lte: to } }),
    HealthRecord.find({ horse: h, date: { $gte: from } }).populate('examinedBy', 'name'),
    Treatment.find({ horse: h, createdAt: { $gte: from } }).populate('prescribedBy', 'name'),
    DailyTask.find({ horse: h, status: 'completed', completedAt: { $gte: from } }).populate('assignedTo', 'name'),
    DailyTask.find({ horse: h, 'incidentReport.reportedAt': { $gte: from } }).populate('assignedTo', 'name'),
    ExamRequest.find({ horse: h, createdAt: { $gte: from } }).populate('requestedBy', 'name role'),
    RaceEntry.find({ horse: h, raceDate: { $gte: from } }).populate('registeredBy', 'name'),
  ]);

  const events = [
    ...sessionEvents(sessions),
    ...examEvents(records),
    ...treatmentEvents(treatments),
    ...careEvents(care),
    ...incidentEvents(incidents),
    ...requestEvents(requests),
    ...raceEvents(races),
  ]
    .filter((e) => e.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  return ok(res, { horse, from, to, days, events }, 'Timeline fetched.');
});

module.exports = { getTimeline };
