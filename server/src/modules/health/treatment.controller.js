const Treatment = require('../../models/Treatment');
const HealthRecord = require('../../models/HealthRecord');
const Horse = require('../../models/Horse');
const TrainingSession = require('../../models/TrainingSession');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const RaceEntry = require('../../models/RaceEntry');
const DailyTask = require('../../models/DailyTask');
const User = require('../../models/User');
const { dayBounds } = require('../../utils/taskTiming');
const { notifyHorseStaff, notifyCaretaker, pushNotification } = require('../alerts/notification.service');
const { syncCareTasks } = require('./treatmentCare.service');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const pick = require('../../utils/pick');
const { syncHorseHealthStatus } = require('./injuryMarker.controller');
const InventoryItem = require('../../models/InventoryItem');
const { LEVELS, LEVEL_RANK, INTENSITY_RANK, levelOf, getTrainingClearance } = require('./trainingClearance');
const { withSupplyStatus } = require('../inventory/stock.service');

const TREATMENT_FIELDS = ['healthRecord', 'horse', 'medications', 'careInstructions', 'isTrainingLocked', 'trainingLevel', 'lockReason', 'startDate', 'endDate', 'status'];

const listTreatments = asyncHandler(async (req, res) => {
  const { isTrainingLocked, status } = req.query;
  const filter = {};
  const horse = await horseFilter(req.user, req.query.horse);
  if (horse !== undefined) filter.horse = horse;
  if (isTrainingLocked !== undefined) filter.isTrainingLocked = isTrainingLocked === 'true';
  if (status) filter.status = status;

  const treatments = await Treatment.find(filter)
    .populate('horse', 'name healthStatus')
    .populate('prescribedBy', 'name')
    .sort({ createdAt: -1 });
  return ok(res, treatments, 'Treatments fetched.');
});

async function loadTreatment(req, res) {
  const treatment = await Treatment.findById(req.params.id);
  if (!treatment) {
    fail(res, 'Treatment not found.', 404);
    return null;
  }
  if (!(await canAccessHorse(req.user, treatment.horse))) {
    fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
    return null;
  }
  return treatment;
}

const getTreatment = asyncHandler(async (req, res) => {
  const treatment = await loadTreatment(req, res);
  if (!treatment) return undefined;
  await treatment.populate([{ path: 'horse' }, { path: 'prescribedBy', select: 'name' }]);
  return ok(res, treatment, 'Treatment fetched.');
});

// Cancels any not-yet-run session for a horse the moment it goes under a training lock — without
// this, a session the Head Trainer scheduled *before* the lock existed just sits there as
// "scheduled"/"in_progress" and nothing stops it from actually being run or evaluated.
async function cancelPendingSessionsForLock(horseId, actorId, level = 'none') {
  // Under a lock every booked session goes; while recovering, only those above the allowed level.
  const above = Object.keys(INTENSITY_RANK).filter((i) => INTENSITY_RANK[i] > LEVEL_RANK[level]);
  const filter = { horse: horseId, status: { $in: ['scheduled', 'in_progress'] } };
  if (level !== 'none') filter.intensity = { $in: above };
  const result = await TrainingSession.updateMany(filter, { status: 'cancelled' });
  if (result.modifiedCount > 0) {
    await logAction({
      actorId,
      action: 'trainingSession.auto_cancelled_by_lock',
      targetModel: 'Horse',
      targetId: horseId,
      metadata: { count: result.modifiedCount },
    });
  }
  return result.modifiedCount;
}

/**
 * Turns the treatment into today's work for the horse's groom (see treatmentCare.service.js) and
 * tells them when there is something new to do. The vet's prescription used to stop at the record.
 */
async function sendCareOrders(treatment, vet, { isNew = false } = {}) {
  const { created: createdCount, caretaker, wanted } = await syncCareTasks(treatment);
  if (wanted === 0) return 0;

  const horse = await Horse.findById(treatment.horse).select('name');
  const horseName = horse?.name || 'ngựa';
  const meds = (treatment.medications || []).map((m) => [m.name, m.dosage].filter(Boolean).join(' ')).join(', ');

  // Nobody can carry the order out: say so once, when the treatment is written.
  if (!caretaker) {
    if (isNew) {
      await notifyHorseStaff({
        staff: 'trainer',
        horse: treatment.horse,
        type: 'care_order',
        severity: 'warning',
        message: `💊 Bác sĩ ${vet.name} kê y lệnh cho ${horseName} nhưng ngựa chưa có nhân viên chăm sóc phụ trách — chưa ai nhận việc.`,
      });
    }
    return 0;
  }
  if (createdCount === 0) return 0;

  // The trainer plans around the treatment, and follows whether the doses are given.
  const caretakerName = (await User.findById(caretaker).select('name'))?.name || 'nhân viên chăm sóc';
  await notifyHorseStaff({
    staff: 'trainer',
    horse: treatment.horse,
    type: 'care_order',
    severity: 'info',
    message: `💊 Bác sĩ ${vet.name} kê y lệnh cho ${horseName}${meds ? `: ${meds}` : ''}${
      treatment.careInstructions ? ` — ${treatment.careInstructions}` : ''
    }. ${caretakerName} thực hiện; theo dõi tiến độ ở trang Tổng quan.`,
  });

  await pushNotification({
    recipientUser: caretaker,
    horse: treatment.horse,
    type: 'care_order',
    severity: 'warning',
    message: `💊 Bác sĩ ${vet.name} có y lệnh chăm sóc ${horse?.name || 'ngựa'}: ${createdCount} việc cần làm hôm nay${
      treatment.careInstructions ? ` — ${treatment.careInstructions}` : '.'
    }`,
  });
  return createdCount;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Checks and tidies a prescription: each medicine has a name (taken from the stock item when one is
 * linked), a stock item that really is a medicine, a positive amount per dose when linked, and
 * valid, distinct times of day. Returns { medications } or { error }.
 */
async function normalizeMedications(list) {
  if (!Array.isArray(list)) return { error: 'medications phải là danh sách.' };
  const ids = list.map((m) => m.inventoryItem).filter(Boolean);
  const items = ids.length ? await InventoryItem.find({ _id: { $in: ids } }).select('name unit category') : [];
  const byId = new Map(items.map((i) => [String(i._id), i]));
  const out = [];
  for (const [i, m] of list.entries()) {
    const label = `Thuốc thứ ${i + 1}`;
    const item = m.inventoryItem ? byId.get(String(m.inventoryItem)) : null;
    if (m.inventoryItem && !item) return { error: `${label}: không tìm thấy mặt hàng trong kho.` };
    if (item && item.category !== 'medicine') return { error: `${label}: "${item.name}" không phải thuốc/vật tư y tế.` };
    const amount = m.amount === undefined || m.amount === null || m.amount === '' ? undefined : Number(m.amount);
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) return { error: `${label}: lượng mỗi liều phải là số dương.` };
    if (item && !amount) return { error: `${label}: nhập lượng mỗi liều (đơn vị ${item.unit}) để trừ kho.` };
    const times = [...new Set((m.times || []).map((t) => String(t).trim()).filter(Boolean))].sort();
    const bad = times.find((t) => !TIME_PATTERN.test(t));
    if (bad) return { error: `${label}: giờ "${bad}" không đúng dạng HH:mm.` };
    const name = String(m.name || item?.name || '').trim();
    if (!name) return { error: `${label}: thiếu tên thuốc.` };
    out.push({
      name,
      dosage: String(m.dosage || (item && amount ? `${amount} ${item.unit}/lần` : '')).trim() || 'theo chỉ định',
      frequency: m.frequency || (times.length ? `${times.length} lần/ngày` : undefined),
      inventoryItem: item?._id || null,
      amount,
      times,
    });
  }
  return { medications: out };
}

/**
 * The training level and the old lock flag describe the same thing; whichever one the request sent,
 * the other is brought in line. The vet's current screens send only isTrainingLocked: locking means
 * "none", unlocking means "no restriction" unless a recovery level was already set.
 * Returns an error message, or null.
 */
function applyTrainingLevel(changes, current) {
  if (changes.trainingLevel !== undefined) {
    if (!LEVELS.includes(changes.trainingLevel)) return 'Mức tập không hợp lệ (none, light, moderate, high).';
    changes.isTrainingLocked = changes.trainingLevel === 'none';
    return null;
  }
  if (changes.isTrainingLocked !== undefined) {
    const locked = Boolean(changes.isTrainingLocked);
    const now = current ? levelOf({ trainingLevel: current.trainingLevel, isTrainingLocked: current.isTrainingLocked, status: 'ongoing' }) : 'high';
    changes.isTrainingLocked = locked;
    changes.trainingLevel = locked ? 'none' : now === 'none' ? 'high' : now;
  }
  return null;
}

async function upcomingRaceNote(horseId) {
  const races = await RaceEntry.find({ horse: horseId, status: { $in: ['registered', 'confirmed'] }, raceDate: { $gte: new Date() } }).select('raceName raceDate');
  return races.length ? ` Lưu ý: ngựa đang đăng ký ${races.map((r) => `${r.raceName} (${r.raceDate.toLocaleDateString('vi-VN')})`).join(', ')}.` : '';
}

/**
 * Side effects of the vet changing how hard a horse may work, whichever route did it: locking,
 * lowering to a recovery level, raising it again, or completing the treatment (= fully recovered).
 * Lowering cancels the booked sessions above the new level and tells the trainer, the groom and
 * (through the horse's room) the owner; raising tells them what is allowed again.
 */
async function onTrainingLevelChanged(treatment, { previousLevel, actor }) {
  const next = levelOf(treatment);
  if (next === previousLevel) return;

  const horse = await Horse.findById(treatment.horse).select('name');
  const horseName = horse?.name || 'Ngựa';
  const lowered = LEVEL_RANK[next] < LEVEL_RANK[previousLevel];

  await logAction({
    actorId: actor._id,
    action: next === 'none' ? 'treatment.lock_training' : previousLevel === 'none' ? 'treatment.unlock_training' : 'treatment.training_level',
    targetModel: 'Treatment',
    targetId: treatment._id,
    metadata: { from: previousLevel, to: next, lockReason: treatment.lockReason },
  });

  // What applies to the horse now, across all its ongoing treatments.
  const clearance = await getTrainingClearance(treatment.horse);
  const room = [`horse:${treatment.horse}`];

  if (lowered) {
    const cancelled = await cancelPendingSessionsForLock(treatment.horse, actor._id, clearance.level);
    const cancelNote = cancelled > 0 ? ` Đã tự động hủy ${cancelled} buổi tập đã lên lịch trước đó.` : '';
    // A race the horse is entered for is the trainer's decision to withdraw, not something to do
    // silently — but they need to be reminded it exists.
    const raceNote = await upcomingRaceNote(treatment.horse);

    if (clearance.level === 'none') {
      await notifyHorseStaff({
        staff: 'trainer',
        horse: treatment.horse,
        type: 'injury_lock',
        severity: 'critical',
        message: `🔒 ${horseName} bị khóa huấn luyện khẩn cấp: ${treatment.lockReason || 'chỉ định y tế'}.${cancelNote}${raceNote}`,
        extraRooms: room,
      });
      // The groom is the one who would otherwise lead the horse out in the morning.
      await notifyCaretaker({
        horse: treatment.horse,
        type: 'injury_lock',
        severity: 'critical',
        message: `🔒 ${horseName} bị bác sĩ khóa huấn luyện: ${treatment.lockReason || 'chỉ định y tế'}. Không đưa ngựa ra tập, chăm sóc tại chuồng theo y lệnh.`,
      });
      return;
    }

    await notifyHorseStaff({
      staff: 'trainer',
      horse: treatment.horse,
      type: 'training_restricted',
      severity: 'warning',
      message: `⚠️ ${horseName} đang hồi phục: bác sĩ chỉ cho ${clearance.label}.${cancelNote}${raceNote}`,
      extraRooms: room,
    });
    await notifyCaretaker({
      horse: treatment.horse,
      type: 'training_restricted',
      severity: 'warning',
      message: `⚠️ ${horseName} đang hồi phục — bác sĩ chỉ cho ${clearance.label}. Chăm sóc theo y lệnh.`,
    });
    return;
  }

  // Raised. Lifting a lock matters to the trainer as much as issuing one: without a word, a horse
  // the vet has cleared just sits unscheduled until someone happens to notice.
  if (previousLevel === 'none') await syncHorseHealthStatus(treatment.horse);
  if (clearance.level === 'none') {
    await notifyHorseStaff({
      staff: 'trainer',
      horse: treatment.horse,
      type: 'training_unlocked',
      severity: 'info',
      message: `🔓 Bác sĩ đã gỡ một lệnh khóa của ${horseName}, nhưng ngựa vẫn còn lệnh khóa khác.`,
      extraRooms: room,
    });
    return;
  }

  const full = clearance.level === 'high';
  await notifyHorseStaff({
    staff: 'trainer',
    horse: treatment.horse,
    type: 'training_unlocked',
    severity: 'info',
    message: full
      ? `🔓 ${horseName} đã được bác sĩ gỡ khóa huấn luyện — có thể xếp lịch tập lại.`
      : `🔓 ${horseName} được bác sĩ cho tập lại ở mức hồi phục: ${clearance.label}. Buổi tập vượt mức vẫn bị chặn.`,
    extraRooms: room,
  });
  await notifyCaretaker({
    horse: treatment.horse,
    type: 'training_unlocked',
    severity: 'info',
    message: full
      ? `🔓 ${horseName} đã được bác sĩ gỡ khóa huấn luyện — ngựa có thể tập lại theo lịch của HLV.`
      : `🔓 ${horseName} được tập lại ở mức hồi phục: ${clearance.label}.`,
  });
}

const createTreatment = asyncHandler(async (req, res) => {
  const body = pick(req.body, TREATMENT_FIELDS);
  if (!(await canAccessHorse(req.user, body.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  if (body.medications !== undefined) {
    const { medications, error } = await normalizeMedications(body.medications);
    if (error) return fail(res, error, 400);
    body.medications = medications;
  }
  const levelError = applyTrainingLevel(body, null);
  if (levelError) return fail(res, levelError, 400);

  // A treatment follows from an exam of the same horse.
  const record = await HealthRecord.findById(body.healthRecord).select('horse');
  if (!record) return fail(res, 'Không tìm thấy hồ sơ khám.', 404);
  if (String(record.horse) !== String(body.horse)) return fail(res, 'Hồ sơ khám không thuộc ngựa này.', 400);

  const treatment = await Treatment.create({ ...body, prescribedBy: req.user._id });
  await logAction({ actorId: req.user._id, action: 'treatment.create', targetModel: 'Treatment', targetId: treatment._id });
  await onTrainingLevelChanged(treatment, { previousLevel: 'high', actor: req.user });
  await sendCareOrders(treatment, req.user, { isNew: true });

  return created(res, treatment, 'Treatment created.');
});

const updateTreatment = asyncHandler(async (req, res) => {
  const treatment = await loadTreatment(req, res);
  if (!treatment) return undefined;

  const previousLevel = levelOf(treatment);
  // The horse and the exam it came from are fixed once the treatment exists.
  const { horse, healthRecord, ...changes } = pick(req.body, TREATMENT_FIELDS);
  if (changes.medications !== undefined) {
    const { medications, error } = await normalizeMedications(changes.medications);
    if (error) return fail(res, error, 400);
    changes.medications = medications;
  }
  const levelError = applyTrainingLevel(changes, treatment);
  if (levelError) return fail(res, levelError, 400);
  Object.assign(treatment, changes);
  await treatment.save();

  await logAction({ actorId: req.user._id, action: 'treatment.update', targetModel: 'Treatment', targetId: treatment._id });
  // Completing a treatment ends its restriction too: the horse counts as recovered from it.
  await onTrainingLevelChanged(treatment, { previousLevel, actor: req.user });
  // Also removes the care tasks still pending when the treatment has just been completed.
  await sendCareOrders(treatment, req.user);
  return ok(res, treatment, 'Treatment updated.');
});

// Dedicated emergency endpoint: set/lift the "lock training" order for a horse, independent of a
// full treatment-record edit. This is the action the Vet reaches for in an urgent situation.
const setTrainingLock = asyncHandler(async (req, res) => {
  const treatment = await loadTreatment(req, res);
  if (!treatment) return undefined;

  const previousLevel = levelOf(treatment);
  // { trainingLevel } from the recovery-level control, or the older { isTrainingLocked } toggle.
  const changes = {};
  if (req.body.trainingLevel !== undefined) changes.trainingLevel = req.body.trainingLevel;
  else changes.isTrainingLocked = Boolean(req.body.isTrainingLocked);
  const levelError = applyTrainingLevel(changes, treatment);
  if (levelError) return fail(res, levelError, 400);
  Object.assign(treatment, changes);
  if (req.body.lockReason !== undefined) treatment.lockReason = req.body.lockReason;
  await treatment.save();

  await onTrainingLevelChanged(treatment, { previousLevel, actor: req.user });
  return ok(res, treatment, treatment.isTrainingLocked ? 'Training lock issued.' : 'Training level updated.');
});

/**
 * The vet's orders being carried out, day by day: every ongoing treatment that asks something of
 * the stable, with that day's tasks and where each stands — not yet taken on, taken on, given (when
 * and by whom), could not be given (and why), or missed. What the trainer and manager follow after
 * the vet prescribes; the vet sees the same for their horses.
 *
 * GET /health/care-orders?date=YYYY-MM-DD&horse=
 */
const listCareOrders = asyncHandler(async (req, res) => {
  const day = req.query.date ? new Date(req.query.date) : new Date();
  if (Number.isNaN(day.getTime())) return fail(res, 'date không hợp lệ.', 400);
  const { start, end } = dayBounds(day);

  const filter = {
    status: 'ongoing',
    $or: [{ 'medications.0': { $exists: true } }, { careInstructions: { $nin: [null, ''] } }],
  };
  const horse = await horseFilter(req.user, req.query.horse);
  if (horse !== undefined) filter.horse = horse;

  const treatments = await Treatment.find(filter)
    .populate('horse', 'name healthStatus')
    .populate('prescribedBy', 'name')
    .sort({ createdAt: -1 });
  const tasks = await DailyTask.find({
    treatment: { $in: treatments.map((t) => t._id) },
    scheduledDate: { $gte: start, $lt: end },
  })
    .populate('assignedTo', 'name')
    .populate('skippedBy', 'name')
    .sort({ taskType: 1, createdAt: 1 });

  const plainTasks = await withSupplyStatus(tasks);
  const rows = treatments.map((t) => {
    const mine = plainTasks.filter((task) => String(task.treatment?._id || task.treatment) === String(t._id));
    const missed = mine.filter((task) => task.status === 'pending' && task.timing.state === 'missed').length;
    return {
      _id: t._id,
      horse: t.horse,
      prescribedBy: t.prescribedBy,
      startDate: t.startDate,
      endDate: t.endDate,
      medications: t.medications,
      careInstructions: t.careInstructions,
      isTrainingLocked: t.isTrainingLocked,
      trainingLevel: levelOf(t),
      date: start,
      tasks: mine,
      progress: {
        total: mine.length,
        done: mine.filter((task) => task.status === 'completed').length,
        notDone: mine.filter((task) => task.status === 'skipped').length,
        missed,
        acknowledged: mine.filter((task) => task.status === 'pending' && task.acknowledgedAt).length,
        waiting: mine.filter((task) => task.status === 'pending' && !task.acknowledgedAt && task.timing.state !== 'missed').length,
      },
    };
  });
  return ok(res, rows, 'Care orders fetched.');
});

module.exports = { listTreatments, getTreatment, createTreatment, updateTreatment, setTrainingLock, listCareOrders };
