const Horse = require('../../models/Horse');
const Treatment = require('../../models/Treatment');
const HealthRecord = require('../../models/HealthRecord');
const DailyTask = require('../../models/DailyTask');
const StableAssignment = require('../../models/StableAssignment');

/**
 * "Is this horse fit to do this particular piece of work, right now?"
 *
 * Every role holds one of the answers, and none of them can see the others' screens: the vet knows
 * the horse's clinical state, the groom knows whether and when it last ate, the manager knows who
 * is responsible for it on the ground. Before this, the trainer could only see the vet's half —
 * which is why a horse could be scheduled to gallop half an hour after a full feed, or with nobody
 * assigned to tack it up, and nothing in the system would notice.
 *
 * Each gate returns one of:
 *   'ok'      — nothing to say
 *   'caution' — the trainer should know, but it is their call (override with a recorded reason)
 *   'blocked' — a medical order; not the trainer's call at all
 *
 * The overall result is the worst gate. Only `medical` can ever return 'blocked', deliberately:
 * feeding and staffing are judgement calls a trainer is entitled to make, a vet's training lock
 * is not.
 */

// A horse needs time between a full feed and hard work — galloping on a full stomach risks colic.
const MIN_DIGEST_MINUTES = 90;
// And it cannot have been fasting all day either; an empty horse has no fuel for the work.
const MAX_FAST_HOURS = 6;
// How long a clean bill of health stays good for before a hard session needs a fresh one.
const CLEARANCE_DAYS = 14;

const STATUS_RANK = { ok: 0, caution: 1, blocked: 2 };

const HEALTH_STATUS_LABELS = {
  eligible: 'đủ điều kiện',
  monitoring: 'cần theo dõi',
  injured: 'chấn thương',
  quarantined: 'cách ly',
};

/** Hard sessions demand a recent exam; an easy trot does not. */
function needsVetClearance({ intensity, sessionType, objective }) {
  return intensity === 'high' || sessionType === 'trial_run' || objective === 'race_simulation';
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

async function medicalGate(horse) {
  const gate = { key: 'medical', label: 'Y tế', status: 'ok', detail: 'Bác sĩ chưa đặt hạn chế nào.' };

  const activeLock = await Treatment.findOne({ horse: horse._id, isTrainingLocked: true, status: 'ongoing' });
  if (activeLock) {
    gate.status = 'blocked';
    gate.detail = `Bác sĩ đang khóa huấn luyện: ${activeLock.lockReason || 'chỉ định y tế'}.`;
    return gate;
  }

  if (horse.healthStatus === 'injured' || horse.healthStatus === 'quarantined') {
    gate.status = 'blocked';
    gate.detail = `Tình trạng sức khỏe hiện tại: ${HEALTH_STATUS_LABELS[horse.healthStatus]}.`;
    return gate;
  }

  if (horse.healthStatus === 'monitoring') {
    gate.status = 'caution';
    gate.detail = 'Ngựa đang trong diện theo dõi — cân nhắc giảm cường độ.';
  }

  return gate;
}

async function vetClearanceGate(horse, options) {
  const gate = {
    key: 'vet_clearance',
    label: 'Giấy khám còn hiệu lực',
    status: 'ok',
    detail: `Buổi tập này không bắt buộc khám gần đây.`,
  };

  if (!needsVetClearance(options)) return gate;

  const latest = await HealthRecord.findOne({ horse: horse._id }).sort({ date: -1, createdAt: -1 });

  if (!latest) {
    gate.status = 'caution';
    gate.detail = `Buổi cường độ cao/chạy thử cần lần khám trong ${CLEARANCE_DAYS} ngày, nhưng ngựa chưa có hồ sơ khám nào.`;
    gate.action = 'request_exam';
    return gate;
  }

  const ageDays = Math.floor((Date.now() - new Date(latest.date).getTime()) / (24 * 60 * 60 * 1000));
  if (ageDays > CLEARANCE_DAYS) {
    gate.status = 'caution';
    gate.detail = `Lần khám gần nhất đã ${ageDays} ngày trước (hiệu lực ${CLEARANCE_DAYS} ngày).`;
    gate.action = 'request_exam';
    return gate;
  }

  const when = ageDays === 0 ? 'hôm nay' : `${ageDays} ngày trước`;
  const conclusion = HEALTH_STATUS_LABELS[latest.resultStatus] || latest.resultStatus;

  // A recent exam only counts as clearance if it cleared the horse. The health status can return
  // to eligible without a fresh exam — resolving every injury marker does that — which is fine for
  // light work, but a hard session should have a vet confirm the recovery first.
  if (latest.resultStatus === 'injured' || latest.resultStatus === 'quarantined') {
    gate.status = 'caution';
    gate.detail = `Lần khám gần nhất (${when}) kết luận "${conclusion}" — buổi nặng cần bác sĩ khám lại xác nhận đã hồi phục.`;
    gate.action = 'request_exam';
    return gate;
  }

  gate.detail = `Đã khám ${when}, kết luận "${conclusion}".`;
  return gate;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MEAL_LABELS = { morning: 'Bữa sáng', noon: 'Bữa trưa', evening: 'Bữa chiều' };
const mealLabel = (task) => MEAL_LABELS[task.mealSlot] || 'Bữa ăn trong ngày';

function describeGap(minutes) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Is the horse fed the right amount of time before this session — not so recently that it would
 * gallop on a full stomach, not so long ago that it has nothing left in it?
 *
 * Looks at the 24 hours before the session rather than the session's calendar day, so an early
 * morning session sees last night's dinner. Meals still scheduled between now and the session
 * count as eaten at their planned time: that is how a lunch at 11:30 ahead of a 12:30 gallop gets
 * flagged when the session is booked, not when it's already too late to move lunch.
 */
async function nutritionGate(horse, when) {
  const gate = { key: 'nutrition', label: 'Dinh dưỡng', status: 'ok', detail: '' };
  const now = new Date();

  // A session on a later day has no meals to judge yet; the check is repeated when it's started.
  if (startOfDay(when) > startOfDay(now)) {
    gate.detail = 'Buổi tập vào ngày khác — hệ thống sẽ kiểm tra lại giờ ăn khi bắt đầu buổi tập.';
    return gate;
  }

  const feedings = await DailyTask.find({
    horse: horse._id,
    taskType: 'feeding',
    scheduledDate: { $gte: new Date(when.getTime() - DAY_MS), $lte: when },
  }).sort({ scheduledDate: 1 });

  // The groom's own words take priority over any timing arithmetic — a horse that refused its
  // feed is a health signal, not a scheduling inconvenience.
  const refused = feedings.find((t) => t.observation?.appetite === 'refused');
  if (refused) {
    gate.status = 'caution';
    gate.detail = `Nhân viên chăm sóc ghi nhận ngựa BỎ ĂN (${mealLabel(refused).toLowerCase()}) — nên cho bác sĩ kiểm tra trước khi tập.`;
    gate.action = 'request_exam';
    return gate;
  }

  const reported = feedings.find((t) => t.incidentReport?.description);
  if (reported) {
    gate.status = 'caution';
    gate.detail = `Có báo cáo sự cố trong ${mealLabel(reported).toLowerCase()}: "${reported.incidentReport.description}".`;
    gate.action = 'request_exam';
    return gate;
  }

  const eaten = feedings
    .filter((t) => t.status === 'completed' && t.completedAt && t.completedAt <= when)
    .map((t) => ({ task: t, at: t.completedAt, planned: false }));
  const upcoming = feedings
    .filter((t) => t.status === 'pending' && t.scheduledDate >= now)
    .map((t) => ({ task: t, at: t.scheduledDate, planned: true }));
  const lastEatenAt = eaten.length ? Math.max(...eaten.map((m) => m.at.getTime())) : 0;

  // A meal whose time has passed with nobody marking it done, after the last one that was.
  const missed = feedings.find(
    (t) => t.status === 'pending' && t.scheduledDate < now && t.scheduledDate.getTime() > lastEatenAt
  );
  if (missed) {
    gate.status = 'caution';
    gate.detail = `${mealLabel(missed)} (${formatTime(missed.scheduledDate)}) chưa được đánh dấu đã cho ăn.`;
    return gate;
  }

  const meals = [...eaten, ...upcoming];
  if (meals.length === 0) {
    gate.status = 'caution';
    gate.detail = 'Không có bữa ăn nào trong 24 giờ trước giờ tập — tập khi đói ngựa sẽ không đủ sức.';
    return gate;
  }

  const last = meals.reduce((a, b) => (a.at > b.at ? a : b));
  const gapMinutes = Math.round((when.getTime() - last.at.getTime()) / 60000);
  const which = last.planned
    ? `Theo lịch, ${mealLabel(last.task).toLowerCase()} lúc ${formatTime(last.at)}`
    : `Ăn lần cuối lúc ${formatTime(last.at)}`;

  if (gapMinutes < MIN_DIGEST_MINUTES) {
    gate.status = 'caution';
    gate.detail = `${which}, chỉ cách giờ tập ${gapMinutes} phút — cần tối thiểu ${MIN_DIGEST_MINUTES} phút để tiêu hóa, chạy khi no dễ bị đau bụng.`;
    return gate;
  }

  if (gapMinutes > MAX_FAST_HOURS * 60) {
    gate.status = 'caution';
    gate.detail = `${which}, đã ${describeGap(gapMinutes)} trước giờ tập — ngựa có thể đã đói.`;
    return gate;
  }

  gate.detail = `${which}, cách giờ tập ${describeGap(gapMinutes)} — hợp lý.`;
  const partial = eaten.find((m) => m.task.observation?.appetite === 'partial');
  if (partial) {
    gate.status = 'caution';
    gate.detail += ` Nhưng có bữa ngựa chỉ ăn ${partial.task.observation.amountEatenPercent ?? 'một phần'}% khẩu phần.`;
  }
  return gate;
}

async function careAssignmentGate(horse) {
  const gate = { key: 'care_assignment', label: 'Người chăm sóc', status: 'ok', detail: '' };

  const assignment = await StableAssignment.findOne({ horse: horse._id }).populate('assignedCaretaker', 'name');

  if (!assignment) {
    gate.status = 'caution';
    gate.detail = 'Ngựa chưa được xếp chuồng — không ai chuẩn bị và theo dõi sau buổi tập.';
    return gate;
  }

  if (!assignment.assignedCaretaker) {
    gate.status = 'caution';
    gate.detail = `Chuồng ${assignment.stableBlock} chưa có nhân viên chăm sóc phụ trách.`;
    return gate;
  }

  gate.detail = `${assignment.assignedCaretaker.name} phụ trách (${assignment.stableBlock}).`;
  return gate;
}

/**
 * Runs all four gates for a horse against a proposed session.
 * Returns `null` when the horse doesn't exist, so callers can 404 on their own terms.
 * Throws a 400-coded error for an unparseable scheduledAt rather than computing gaps from NaN.
 */
async function computeReadiness(horseId, { scheduledAt, intensity, sessionType, objective } = {}) {
  const when = scheduledAt ? new Date(scheduledAt) : new Date();
  if (Number.isNaN(when.getTime())) {
    const err = new Error('scheduledAt không phải ngày giờ hợp lệ.');
    err.statusCode = 400;
    throw err;
  }

  const horse = await Horse.findById(horseId).select('name healthStatus');
  if (!horse) return null;

  const options = { intensity, sessionType, objective };
  const gates = await Promise.all([
    medicalGate(horse),
    vetClearanceGate(horse, options),
    nutritionGate(horse, when),
    careAssignmentGate(horse),
  ]);

  const overall = gates.reduce(
    (worst, gate) => (STATUS_RANK[gate.status] > STATUS_RANK[worst] ? gate.status : worst),
    'ok'
  );

  return {
    horse: { _id: horse._id, name: horse.name },
    scheduledAt: when,
    overall: overall === 'ok' ? 'ready' : overall,
    gates,
  };
}

/** The gates a trainer may override, i.e. everything the vet didn't hard-block. */
function cautionGates(readiness) {
  return readiness.gates.filter((g) => g.status === 'caution');
}

/**
 * Why this horse may not be trained at all right now, or null if nothing stops it. The single
 * definition of "medically grounded", shared by plan creation, session creation and session start
 * — each used to carry its own copy of the lock-or-injured check.
 */
async function getMedicalBlock(horseId) {
  const horse = await Horse.findById(horseId).select('healthStatus');
  if (!horse) return null;
  const gate = await medicalGate(horse);
  return gate.status === 'blocked' ? gate.detail : null;
}

/** Snapshot stored on a session: the gates as they stood when the decision was made. */
function toSnapshot(readiness, { overrideReason, userId } = {}) {
  const overridden = cautionGates(readiness).length > 0 && overrideReason;
  return {
    checkedAt: new Date(),
    overall: readiness.overall,
    gates: readiness.gates.map((g) => ({ key: g.key, status: g.status, detail: g.detail })),
    overrideReason: overridden ? overrideReason : undefined,
    overriddenBy: overridden ? userId : undefined,
  };
}

module.exports = {
  computeReadiness,
  cautionGates,
  getMedicalBlock,
  toSnapshot,
  needsVetClearance,
  MIN_DIGEST_MINUTES,
  MAX_FAST_HOURS,
  CLEARANCE_DAYS,
};
