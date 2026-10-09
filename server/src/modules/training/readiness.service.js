const Horse = require('../../models/Horse');
const HealthRecord = require('../../models/HealthRecord');
const DailyTask = require('../../models/DailyTask');
const StableAssignment = require('../../models/StableAssignment');
const { findOpenIncident } = require('../stable/incident.service');
const { getTrainingClearance, allows } = require('../health/trainingClearance');
const clubPolicy = require('../../config/clubPolicy');

const INTENSITY_WORDS = { light: 'nhẹ', moderate: 'vừa', high: 'cao' };

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
 *   'blocked' — a medical order, or a horse that has just eaten; not the trainer's call
 *
 * The overall result is the worst gate. `medical` blocks on a vet's order; `nutrition` blocks only
 * a horse that ate less than an hour ago — galloping on a full stomach is a colic risk, not a
 * judgement call. Everything else about feeding and staffing is the trainer's call.
 */

// A horse needs time between a full feed and hard work — galloping on a full stomach risks colic.
// Under an hour after a meal it is not allowed at all; up to an hour and a half it is a warning.
// Club policy (config/clubPolicy.js), not a veterinary constant.
const MIN_DIGEST_MINUTES = clubPolicy.digestMinutes;
const HARD_DIGEST_MINUTES = clubPolicy.digestHardMinutes;
const FORAGE_DIGEST_MINUTES = clubPolicy.forageDigestMinutes;
// And it cannot have been fasting all day either; an empty horse has no fuel for the work.
const MAX_FAST_HOURS = clubPolicy.maxFastHours;
// How long a clean bill of health stays good for before a hard session needs a fresh one.
const CLEARANCE_DAYS = clubPolicy.clearanceDays;

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

async function medicalGate(horse, { intensity } = {}) {
  const gate = { key: 'medical', label: 'Y tế', status: 'ok', detail: 'Bác sĩ chưa đặt hạn chế nào.' };

  if (horse.isArchived) {
    gate.status = 'blocked';
    gate.detail = 'Ngựa đã ngừng quản lý tại câu lạc bộ.';
    return gate;
  }

  // The vet's level on the ongoing treatments (trainingClearance.js): none is the training lock.
  const clearance = await getTrainingClearance(horse._id);
  if (clearance.level === 'none') {
    gate.status = 'blocked';
    gate.detail = `Bác sĩ đang khóa huấn luyện: ${clearance.reason || 'chỉ định y tế'}.`;
    return gate;
  }

  if (horse.healthStatus === 'injured' || horse.healthStatus === 'quarantined') {
    gate.status = 'blocked';
    gate.detail = `Tình trạng sức khỏe hiện tại: ${HEALTH_STATUS_LABELS[horse.healthStatus]}.`;
    return gate;
  }

  // Recovering: the vet allows some work but not all of it. Going above that level is not the
  // trainer's call, so it blocks like the lock does; within it, the trainer is simply told.
  if (clearance.restricted) {
    const since = clearance.since ? ` (từ ${new Date(clearance.since).toLocaleDateString('vi-VN')})` : '';
    const limit = `Ngựa đang hồi phục — bác sĩ${clearance.prescribedBy ? ` ${clearance.prescribedBy}` : ''} chỉ cho ${clearance.label}${since}`;
    if (!allows(clearance, intensity)) {
      gate.status = 'blocked';
      gate.detail = `${limit}; buổi cường độ ${INTENSITY_WORDS[intensity] || intensity} chưa được phép.`;
      return gate;
    }
    gate.detail = `${limit}.`;
  }

  if (horse.healthStatus === 'monitoring') {
    gate.status = 'caution';
    gate.detail = `${clearance.restricted ? `${gate.detail} ` : ''}Ngựa đang trong diện theo dõi — cân nhắc giảm cường độ.`;
  }

  // Something the groom saw and reported, that no vet has answered yet. Whatever task it was
  // filed on: a lame horse reported while mucking out is as unfit to gallop as one that left its
  // feed. It stays amber until the vet closes the report or examines the horse.
  const incident = await findOpenIncident(horse._id);
  if (incident) {
    const waiting = incident.status === 'acknowledged' ? 'bác sĩ đã tiếp nhận nhưng chưa kết luận' : 'bác sĩ chưa xử lý';
    const note = `Nhân viên chăm sóc báo sự cố: "${incident.description}" — ${waiting}.`;
    gate.detail = gate.status === 'caution' ? `${gate.detail} ${note}` : note;
    gate.status = 'caution';
    gate.action = 'request_exam';
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
// What a meal was, from the ration it took out of stock: forage (hay) sits lighter than grain or pellets.
// Supplements (vitamins, minerals, salt, electrolytes, oil) don't change that. No ration recorded: a main meal.
const FORAGE = /(cỏ|hay|rơm|alfalfa|timothy|chaff|straw)/i;
const SUPPLEMENT = /(vitamin|khoáng|mineral|muối|salt|điện giải|electrolyte|dầu|oil)/i;
function mealKind(task) {
  const items = (task?.supplies || []).filter((i) => i?.name);
  if (!items.length) return 'main';
  const solid = items.filter((i) => !SUPPLEMENT.test(i.name));
  return solid.length && solid.every((i) => FORAGE.test(i.name)) ? 'forage' : 'main';
}

async function nutritionGate(horse, when, { intensity } = {}) {
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

  // Droppings are the other early warning the groom sees: loose or none at all points to a gut
  // problem, and dry droppings with little drinking is the classic early colic picture. Galloping a
  // horse in that state is how colic becomes an emergency.
  const gut = feedings.find(
    (t) =>
      t.observation?.manure === 'loose' ||
      t.observation?.manure === 'none' ||
      (t.observation?.manure === 'dry' && t.observation?.waterIntake === 'low')
  );
  if (gut) {
    const what = { loose: 'phân lỏng', none: 'không thấy phân', dry: 'phân khô, uống ít nước' }[gut.observation.manure];
    gate.status = 'caution';
    gate.detail = `Nhân viên chăm sóc ghi nhận ${what} (${mealLabel(gut).toLowerCase()}) — dấu hiệu rối loạn tiêu hóa, nên cho bác sĩ kiểm tra trước khi tập.`;
    gate.action = 'request_exam';
    return gate;
  }

  // Only the meal right before the session matters: that is what the horse has in its stomach (or
  // is missing) when it works. An unmarked breakfast says nothing about an evening session once a
  // later meal has been given — judging by the oldest unmarked meal used to flag nearly every
  // session and push trainers into overriding everything.
  const before = feedings.filter((t) => t.scheduledDate <= when);
  const lastMeal = before[before.length - 1];
  const done = (t) => t.status === 'completed' && t.completedAt && t.completedAt <= when;
  const lastEaten = [...before].reverse().find(done);

  if (!lastMeal) {
    gate.status = 'caution';
    gate.detail = 'Không có bữa ăn nào trong 24 giờ trước giờ tập — tập khi đói ngựa sẽ không đủ sức.';
    return gate;
  }

  // The meal before the session has been given: judge the real gap.
  if (lastEaten && (lastEaten === lastMeal || lastEaten.completedAt >= lastMeal.scheduledDate)) {
    const gapMinutes = Math.round((when.getTime() - lastEaten.completedAt.getTime()) / 60000);
    const kind = mealKind(lastEaten);
    const which = `${mealLabel(lastEaten)}${kind === 'forage' ? ' (chỉ cỏ khô)' : ''} cho ăn lúc ${formatTime(lastEaten.completedAt)}`;
    const light = intensity === 'light';
    // A forage-only meal, or light work: a warning at most. Grain or pellets before harder work: the
    // club's hard limit applies.
    const caution = kind === 'forage' ? FORAGE_DIGEST_MINUTES : MIN_DIGEST_MINUTES;
    if (gapMinutes < HARD_DIGEST_MINUTES && kind === 'main' && !light) {
      const from = new Date(lastEaten.completedAt.getTime() + MIN_DIGEST_MINUTES * 60000);
      gate.status = 'blocked';
      gate.detail = `${which}, mới ${gapMinutes} phút trước giờ tập — theo quy định CLB không tập sau bữa có thức ăn tinh dưới ${HARD_DIGEST_MINUTES} phút (nguy cơ đau bụng, xoắn ruột). Nên đủ ${MIN_DIGEST_MINUTES} phút: tập được từ ${formatTime(from)}.`;
      return gate;
    }
    if (gapMinutes < (light ? HARD_DIGEST_MINUTES : caution)) {
      gate.status = 'caution';
      gate.detail = light
        ? `${which}, mới ${gapMinutes} phút trước giờ tập — buổi nhẹ (đi bộ) vẫn tập được, nhưng theo quy định CLB nên chờ ${HARD_DIGEST_MINUTES} phút.`
        : `${which}, chỉ cách giờ tập ${gapMinutes} phút — theo quy định CLB nên chờ ${caution} phút sau ${kind === 'forage' ? 'bữa cỏ' : 'bữa chính'} trước khi tập nặng.`;
      return gate;
    }
    if (gapMinutes > MAX_FAST_HOURS * 60) {
      gate.status = 'caution';
      gate.detail = `${which}, đã ${describeGap(gapMinutes)} trước giờ tập — ngựa có thể đã đói.`;
      return gate;
    }
    gate.detail = `${which}, cách giờ tập ${describeGap(gapMinutes)} — đủ thời gian tiêu hóa.`;
    if (lastEaten.observation?.appetite === 'partial') {
      gate.status = 'caution';
      gate.detail += ` Nhưng ngựa chỉ ăn ${lastEaten.observation.amountEatenPercent ?? 'một phần'}% khẩu phần.`;
    }
    return gate;
  }

  // The meal before the session is still to come (a session later today): judge the planned gap.
  if (lastMeal.status === 'pending' && lastMeal.scheduledDate > now) {
    const gapMinutes = Math.round((when.getTime() - lastMeal.scheduledDate.getTime()) / 60000);
    const planned = mealKind(lastMeal) === 'forage' ? FORAGE_DIGEST_MINUTES : MIN_DIGEST_MINUTES;
    if (gapMinutes < (intensity === 'light' ? HARD_DIGEST_MINUTES : planned)) {
      gate.status = 'caution';
      gate.detail = `Theo lịch, ${mealLabel(lastMeal).toLowerCase()} lúc ${formatTime(lastMeal.scheduledDate)}, chỉ cách giờ tập ${gapMinutes} phút — hãy dời giờ tập hoặc báo nhân viên cho ăn sớm hơn (theo quy định CLB: ${planned} phút).`;
      return gate;
    }
    gate.detail = `Theo lịch, ${mealLabel(lastMeal).toLowerCase()} lúc ${formatTime(lastMeal.scheduledDate)}, cách giờ tập ${describeGap(gapMinutes)} — đủ thời gian tiêu hóa.`;
    return gate;
  }

  // Its time has passed and nobody marked it given.
  gate.status = 'caution';
  gate.detail = `${mealLabel(lastMeal)} (${formatTime(lastMeal.scheduledDate)}) — bữa ngay trước giờ tập — chưa được nhân viên đánh dấu đã cho ăn.${
    lastEaten ? ` Lần ăn gần nhất được ghi nhận: ${formatTime(lastEaten.completedAt)}.` : ''
  }`;
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

  const horse = await Horse.findById(horseId).select('name healthStatus isArchived');
  if (!horse) return null;

  const options = { intensity, sessionType, objective };
  const gates = await Promise.all([
    medicalGate(horse, options),
    vetClearanceGate(horse, options),
    nutritionGate(horse, when, options),
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
  const horse = await Horse.findById(horseId).select('healthStatus isArchived');
  if (!horse) return null;
  const gate = await medicalGate(horse);
  return gate.status === 'blocked' ? gate.detail : null;
}

/**
 * Why this horse can't be entered for a race, or null. Racing needs a horse fully cleared: no lock,
 * not injured, and no recovery restriction.
 */
async function getRaceBlock(horseId) {
  const block = await getMedicalBlock(horseId);
  if (block) return block;
  const clearance = await getTrainingClearance(horseId);
  return clearance.restricted ? `Ngựa đang hồi phục (bác sĩ chỉ cho ${clearance.label}) — chưa đủ điều kiện thi đấu.` : null;
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
  getRaceBlock,
  toSnapshot,
  needsVetClearance,
  MIN_DIGEST_MINUTES,
  HARD_DIGEST_MINUTES,
  mealKind,
  MAX_FAST_HOURS,
  CLEARANCE_DAYS,
};
