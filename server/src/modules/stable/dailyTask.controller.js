const DailyTask = require('../../models/DailyTask');
const Horse = require('../../models/Horse');
const User = require('../../models/User');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { ROLES } = require('../../constants/roles');
const { notifyHorseStaff, pushNotification } = require('../alerts/notification.service');
const { logAction } = require('../audit/audit.service');
const { announceIncidentUpdate } = require('./incident.service');
const { taskTiming, dayBounds } = require('../../utils/taskTiming');
const { saveFile } = require('../../utils/fileStore');
const { withSupplyStatus, consumeSupplies, stockMap, shortagesFrom } = require('../inventory/stock.service');
const StableAssignment = require('../../models/StableAssignment');
const FeedingSchedule = require('../../models/FeedingSchedule');
const Treatment = require('../../models/Treatment');
const { clearanceMap, levelOf } = require('../health/trainingClearance');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const pick = require('../../utils/pick');

const TASK_FIELDS = ['horse', 'assignedTo', 'taskType', 'mealSlot', 'scheduledDate', 'note'];

// What a trainer or manager may hand out by hand. Medication and monitoring are the vet's care
// orders: they come from a treatment, not from this form.
const MANUAL_TASK_TYPES = ['feeding', 'cleaning', 'bathing', 'icing'];
const TASK_LABELS = {
  feeding: 'cho ăn',
  cleaning: 'vệ sinh chuồng',
  bathing: 'tắm rửa',
  icing: 'ngâm chân nước đá',
  medication: 'cho dùng thuốc',
  monitoring: 'theo dõi theo y lệnh',
};
const VET_ORDER_MESSAGE = 'Đây là y lệnh của bác sĩ — chỉ bác sĩ thay đổi được qua phác đồ điều trị.';

/**
 * A task is handed out for today or later — giving someone a job for a day that has already gone
 * only creates something overdue the moment it exists. For a meal, its own window must still be
 * open (see utils/taskTiming.js): at 23:00 there is no breakfast left to schedule for today.
 * Returns an error message, or null when the date is fine.
 */
function scheduleProblem({ taskType, mealSlot, scheduledDate }) {
  if (!scheduledDate) return null;
  const when = new Date(scheduledDate);
  if (Number.isNaN(when.getTime())) return 'Ngày thực hiện không hợp lệ.';
  if (when < dayBounds(new Date()).start) return 'Không giao việc cho ngày đã qua.';
  const timing = taskTiming({ status: 'pending', taskType, mealSlot, scheduledDate: when });
  if (timing.state === 'missed') {
    const by = timing.closesAt ? ` (hạn ${timing.closesAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})` : '';
    return `Khung giờ của việc này hôm nay đã qua${by} — không tạo hay dời vào đó được nữa.`;
  }
  return null;
}

/** Tells the groom a task is theirs (or no longer needs doing). They see nothing else change. */
async function tellGroom(task, user, describe) {
  const horse = await Horse.findById(task.horse).select('name');
  await pushNotification({
    recipientUser: task.assignedTo,
    horse: task.horse,
    type: 'task_assigned',
    severity: 'info',
    message: describe({ who: user.name, horse: horse?.name || 'ngựa', what: TASK_LABELS[task.taskType] || task.taskType }),
  });
}

/** Work can only be handed to an active groom — not to a trainer, and not to a disabled account. */
async function isActiveGroom(userId) {
  return Boolean(await User.exists({ _id: userId, role: ROLES.GROOM, isActive: true }));
}

const listTasks = asyncHandler(async (req, res) => {
  const { assignedTo, status, date } = req.query;
  const filter = {};

  // Same per-horse scoping as training and health: a Head Trainer or Vet sees the care work for
  // the horses assigned to them, not the whole club's worklist.
  const horse = await horseFilter(req.user, req.query.horse);
  if (horse !== undefined) filter.horse = horse;
  if (status) filter.status = status;

  // A Groom always gets their own worklist. An explicit ?assignedTo= used to win over the role
  // default, which let one groom read a colleague's list by changing a query parameter.
  if (req.user.role === ROLES.GROOM) filter.assignedTo = req.user._id;
  else if (assignedTo) filter.assignedTo = assignedTo;

  if (date) {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    filter.scheduledDate = { $gte: day, $lt: nextDay };
  }

  const tasks = await DailyTask.find(filter)
    .populate('horse', 'name')
    .populate('assignedTo', 'name')
    .sort({ scheduledDate: -1 });
  // Pending tasks that use up stock say whether the stock covers them right now.
  return ok(res, await withSupplyStatus(tasks), 'Daily tasks fetched.');
});

/** Loads a task the caller may see: their own as a Groom, in-scope horses for everyone else. */
async function loadTask(req, res) {
  const task = await DailyTask.findById(req.params.id);
  if (!task) {
    fail(res, 'Daily task not found.', 404);
    return null;
  }
  const allowed =
    req.user.role === ROLES.GROOM
      ? String(task.assignedTo) === String(req.user._id)
      : await canAccessHorse(req.user, task.horse);
  if (!allowed) {
    fail(res, req.user.role === ROLES.GROOM ? 'Forbidden: this task is assigned to someone else.' : FORBIDDEN_HORSE_MESSAGE, 403);
    return null;
  }
  return task;
}

const getTask = asyncHandler(async (req, res) => {
  const task = await loadTask(req, res);
  if (!task) return undefined;
  await task.populate([{ path: 'horse' }, { path: 'assignedTo', select: 'name' }]);
  return ok(res, task, 'Daily task fetched.');
});

// Assigning daily task lists to the care team is the Head Trainer's job; Club Manager can too.
const createTask = asyncHandler(async (req, res) => {
  const body = pick(req.body, TASK_FIELDS);
  if (!(await canAccessHorse(req.user, body.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  if (!(await isActiveGroom(body.assignedTo))) return fail(res, 'Người được giao phải là nhân viên chăm sóc đang hoạt động.', 400);

  if (!MANUAL_TASK_TYPES.includes(body.taskType)) {
    return fail(res, 'Loại công việc không hợp lệ. Việc dùng thuốc/theo dõi do bác sĩ chỉ định qua phác đồ điều trị.', 400);
  }

  const problem = scheduleProblem({ ...body, scheduledDate: body.scheduledDate || new Date() });
  if (problem) return fail(res, problem, 400);

  const task = await DailyTask.create({ ...body, source: 'trainer' });
  await tellGroom(
    task,
    req.user,
    ({ who, horse, what }) => `📋 ${who} giao việc mới: ${what} cho ${horse}${task.note ? ` — ${task.note}` : '.'}`
  );
  return created(res, task, 'Daily task created.');
});

// Whoever assigned the work can still change their mind: reassign it to a different Groom, move
// the date, or correct the task type. Without this, a mis-assigned task could only ever be worked
// around by creating a second one and leaving the wrong one sitting on someone's list forever.
const updateTask = asyncHandler(async (req, res) => {
  const task = await loadTask(req, res);
  if (!task) return undefined;
  if (task.status === 'completed') return fail(res, 'Không thể sửa công việc đã hoàn thành.', 409);
  if (task.source === 'vet') return fail(res, VET_ORDER_MESSAGE, 409);
  // A meal whose time has passed, or yesterday's dose, is history now — not something to move.
  const timing = taskTiming(task);
  if (!timing.canChange) return fail(res, `Không sửa được nữa: ${timing.reason}`, 409);

  const changes = pick(req.body, TASK_FIELDS);
  if (changes.scheduledDate || changes.taskType || changes.mealSlot) {
    const problem = scheduleProblem({
      taskType: changes.taskType || task.taskType,
      mealSlot: changes.mealSlot !== undefined ? changes.mealSlot : task.mealSlot,
      scheduledDate: changes.scheduledDate || task.scheduledDate,
    });
    if (problem) return fail(res, problem, 400);
  }
  if (changes.taskType && !MANUAL_TASK_TYPES.includes(changes.taskType)) return fail(res, 'Loại công việc không hợp lệ.', 400);
  const previousAssignee = String(task.assignedTo);
  if (changes.horse && !(await canAccessHorse(req.user, changes.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  // "Skipped" is how an assigner calls off a meal or a chore on purpose (e.g. fasting a horse
  // before a race). It keeps the record — and stops the feeding generator from recreating it.
  if (req.body.status !== undefined) {
    if (req.body.status !== 'skipped') return fail(res, 'Chỉ có thể chuyển công việc sang "Đã bỏ qua".', 400);
    if (task.status !== 'pending') return fail(res, 'Chỉ bỏ qua được công việc chưa thực hiện.', 409);
    changes.status = 'skipped';
    changes.skippedBy = req.user._id;
  }
  if (changes.assignedTo && !(await isActiveGroom(changes.assignedTo))) {
    return fail(res, 'Người được giao phải là nhân viên chăm sóc đang hoạt động.', 400);
  }

  Object.assign(task, changes);
  await task.save();

  // The groom only learns of a change to their list if someone tells them.
  if (changes.status === 'skipped') {
    await tellGroom(task, req.user, ({ who, horse, what }) => `🚫 ${who} cho bỏ qua việc ${what} của ${horse} hôm nay.`);
  } else if (String(task.assignedTo) !== previousAssignee) {
    await tellGroom(task, req.user, ({ who, horse, what }) => `📋 ${who} chuyển cho bạn việc ${what} của ${horse}.`);
  }
  return ok(res, task, 'Daily task updated.');
});

// Cancelling an assignment outright (e.g. the horse left the stable, or the task was created by
// mistake) — completed work is kept, since deleting it would erase the record that it was done.
const deleteTask = asyncHandler(async (req, res) => {
  const task = await loadTask(req, res);
  if (!task) return undefined;
  if (task.status === 'completed') {
    return fail(res, 'Không thể xóa công việc đã hoàn thành — đây là bằng chứng công việc đã làm.', 409);
  }
  // Deleting a meal only lasts until the next hourly run, which sees the slot empty and creates it
  // again. Skipping it keeps the slot filled, and records that the meal was deliberately missed.
  if (task.source === 'vet') return fail(res, VET_ORDER_MESSAGE, 409);
  if (task.taskType === 'feeding') {
    return fail(res, 'Việc cho ăn không xoá được vì hệ thống sẽ tự tạo lại — hãy chọn "Bỏ bữa".', 409);
  }
  await task.deleteOne();
  return ok(res, null, 'Daily task deleted.');
});

// The groom's screen sends its own Vietnamese labels inside `observation`; the API was first
// documented with English codes at the top level. Both are accepted and stored as the codes, so
// the readiness check and reports have one vocabulary to read. Unknown values are ignored.
const APPETITE_CODES = {
  full: 'full', partial: 'partial', refused: 'refused',
  'Bình thường': 'full', 'Tốt': 'full', 'Kém': 'partial', 'Bỏ ăn': 'refused',
};
const MANURE_CODES = {
  normal: 'normal', dry: 'dry', loose: 'loose', none: 'none',
  'Bình thường': 'normal', 'Khô / Táo bón': 'dry', 'Lỏng / Tiêu chảy': 'loose', 'Không thấy phân': 'none',
};
const WATER_CODES = { normal: 'normal', high: 'high', low: 'low', 'Bình thường': 'normal', 'Uống nhiều': 'high', 'Uống ít': 'low' };

const MANURE_WARNINGS = { loose: 'phân lỏng', none: 'không thấy phân', dry: 'phân khô' };

function readObservation(body = {}) {
  const src = { ...body, ...(body.observation || {}) };
  const observation = {
    appetite: APPETITE_CODES[src.appetite],
    amountEatenPercent: src.amountEatenPercent,
    manure: MANURE_CODES[src.manure],
    waterIntake: WATER_CODES[src.waterIntake],
    behaviourNote: src.behaviourNote ?? src.notes ?? body.notes,
  };
  const provided = Object.values(observation).some((v) => v !== undefined && v !== '');
  return provided ? observation : null;
}

/**
 * What in an observation a vet should hear about now: refusing feed, or droppings that point to
 * a gut problem (loose, none at all). A dry dropping with the horse drinking little is the classic
 * early colic picture, so that pair counts too.
 */
function warningSigns(o) {
  const signs = [];
  if (o.appetite === 'refused') signs.push('bỏ ăn');
  if (o.manure === 'loose' || o.manure === 'none') signs.push(MANURE_WARNINGS[o.manure]);
  if (o.manure === 'dry' && o.waterIntake === 'low') signs.push('phân khô và uống ít nước');
  return signs;
}

// Completing a task optionally carries what the groom observed while doing it — the body is
// entirely optional, and an empty PATCH behaves exactly as it always did.
//
// It matters because the groom is the only person who sees the horse eat, drink and pass
// droppings. That is what the training readiness check reads to decide whether the horse is fit
// to be worked (see modules/training/readiness.service.js).
const completeTask = asyncHandler(async (req, res) => {
  const task = await loadTask(req, res);
  if (!task) return undefined;

  // A meal the trainer called off (e.g. fasting before a race) must not be recorded as eaten.
  if (task.status === 'skipped') {
    return fail(res, task.skipReason ? 'Công việc này đã được ghi nhận là không thực hiện được.' : 'Công việc này đã được HLV cho bỏ qua.', 409);
  }

  // The first completion time is when the horse actually ate; completing again (e.g. to add an
  // observation afterwards) must not move it, or the readiness board would see a meal that never
  // happened.
  if (task.status !== 'completed') {
    // Only within the task's window on the real clock: breakfast ticked at 23:00 would record a
    // meal eaten at 23:00, and yesterday's dose can't be given today (utils/taskTiming.js).
    const timing = taskTiming(task);
    if (!timing.canComplete) return fail(res, timing.reason, 409, { timing });
    // A meal or a dose takes its supplies out of stock; without them it can't be recorded as given.
    // The groom asks the Manager for more instead (restock request, which can name this task).
    const stock = await consumeSupplies(task.supplies, { actor: req.user, task });
    if (!stock.ok) {
      const list = stock.missing.map((m) => `${m.name} (cần ${m.needed} ${m.unit}, còn ${m.available} ${m.unit})`).join('; ');
      return fail(res, `Thiếu vật tư: ${list} — hãy gửi đề xuất bổ sung cho Quản lý.`, 409, { missing: stock.missing });
    }
    task.status = 'completed';
    task.completedAt = new Date();
    if (!task.acknowledgedAt) task.acknowledgedAt = task.completedAt;
  }

  const observation = readObservation(req.body);
  if (observation) {
    const previous = task.observation?.toObject ? task.observation.toObject() : task.observation || {};
    task.observation = { ...previous, ...Object.fromEntries(Object.entries(observation).filter(([, v]) => v !== undefined)), recordedAt: new Date() };
  }
  await task.save();

  // Refusing feed or abnormal droppings are among the earliest signs something is wrong, and
  // should not wait for someone to notice a row in a list.
  const signs = observation ? warningSigns(observation) : [];
  if (signs.length) {
    const horse = await Horse.findById(task.horse).select('name');
    const note = observation.behaviourNote ? `: ${observation.behaviourNote}` : '.';
    await notifyHorseStaff({
      staff: 'vet',
      horse: task.horse,
      type: 'incident_report',
      severity: 'warning',
      message: `⚠️ ${horse?.name || 'Ngựa'} có dấu hiệu bất thường (${signs.join(', ')})${note}`,
    });
  }

  return ok(res, task, 'Task marked as completed.');
});

// Groom-reported incident, with optional photo evidence uploaded via multipart/form-data.
const reportIncident = asyncHandler(async (req, res) => {
  const { description, severity } = req.body;
  if (!description || !description.trim()) return fail(res, 'Incident description is required.', 400);

  const task = await loadTask(req, res);
  if (!task) return undefined;

  // Kept in the database (GridFS), not on the server's disk, which is wiped on every deploy.
  const stored = await Promise.all(
    (req.files || []).map((f) => saveFile(f, { uploadedBy: req.user._id, purpose: 'incident', task: task._id }))
  );
  const images = stored.map((f) => f.url);
  task.incidentReport = { description, severity: severity || 'medium', images, reportedAt: new Date() };
  await task.save();

  // The vet has to act on it; the trainer has to know before working the horse.
  const horse = await Horse.findById(task.horse).select('name');
  const alert = {
    horse: task.horse,
    type: 'incident_report',
    severity: severity === 'high' ? 'critical' : 'warning',
    message: `⚠️ ${req.user.name} báo sự cố với ${horse?.name || 'Ngựa'}: ${description}`,
  };
  await notifyHorseStaff({ ...alert, staff: 'vet' });
  await notifyHorseStaff({ ...alert, staff: 'trainer' });

  return ok(res, task, 'Incident reported.');
});

/**
 * The groom's reference sheet for each horse they look after: what it eats at each meal and what the
 * vet has prescribed (medicine, amount, times), each with the stock behind it, plus what is short —
 * so they can ask the Manager before a meal or a dose is held up. Other roles get the same sheet
 * for the horses they can see (?horse= narrows it).
 * GET /stable/my-care-plan
 */
const myCarePlan = asyncHandler(async (req, res) => {
  let horseIds;
  if (req.user.role === ROLES.GROOM) {
    horseIds = (await StableAssignment.find({ assignedCaretaker: req.user._id }).select('horse')).map((a) => a.horse);
  } else {
    const scoped = await horseFilter(req.user, req.query.horse);
    const filter = scoped === undefined ? {} : { _id: scoped };
    horseIds = (await Horse.find(filter).select('_id')).map((h) => h._id);
  }
  if (req.query.horse) horseIds = horseIds.filter((id) => String(id) === String(req.query.horse));

  const [horses, stalls, rations, treatments, clearances] = await Promise.all([
    Horse.find({ _id: { $in: horseIds } }).select('name healthStatus').sort({ name: 1 }),
    StableAssignment.find({ horse: { $in: horseIds } }).populate('assignedCaretaker', 'name'),
    FeedingSchedule.find({ horse: { $in: horseIds } }).select('horse mealTime timeOfDay items'),
    Treatment.find({ horse: { $in: horseIds }, status: 'ongoing' })
      .populate('prescribedBy', 'name')
      .select('horse medications careInstructions trainingLevel isTrainingLocked status lockReason startDate endDate prescribedBy'),
    clearanceMap(horseIds),
  ]);
  const ids = [
    ...rations.flatMap((r) => r.items.map((i) => i.inventoryItem)),
    ...treatments.flatMap((t) => t.medications.map((m) => m.inventoryItem)),
  ].filter(Boolean);
  const stock = await stockMap(ids);
  const stockOf = (id) => {
    const item = id ? stock.get(String(id)) : null;
    return item ? { _id: item._id, name: item.name, unit: item.unit, available: item.quantity } : null;
  };
  const MEAL_ORDER = { morning: 0, noon: 1, evening: 2 };

  const sheets = horses.map((h) => {
    const mine = (list) => list.filter((x) => String(x.horse) === String(h._id));
    const horseRations = mine(rations)
      .sort((a, b) => MEAL_ORDER[a.mealTime] - MEAL_ORDER[b.mealTime])
      .map((r) => ({
        _id: r._id,
        mealTime: r.mealTime,
        timeOfDay: r.timeOfDay,
        items: r.items.map((i) => {
          const s = stockOf(i.inventoryItem);
          return { name: i.type, quantity: i.quantity, amount: i.amount, unit: i.unit, stock: s, enough: s ? s.available >= (i.amount || 0) : null };
        }),
      }));
    const prescriptions = mine(treatments).map((t) => ({
      _id: t._id,
      prescribedBy: t.prescribedBy?.name,
      startDate: t.startDate,
      endDate: t.endDate,
      trainingLevel: levelOf(t),
      careInstructions: t.careInstructions,
      medications: t.medications.map((m) => {
        const s = stockOf(m.inventoryItem);
        const daily = (m.amount || 0) * Math.max((m.times || []).length, 1);
        return { name: m.name, dosage: m.dosage, amount: m.amount, times: m.times, stock: s, enough: s ? s.available >= daily : null, dailyNeed: m.amount ? daily : null };
      }),
    }));
    // One day's need per stock item for this horse, against what is in stock.
    const needs = [
      ...horseRations.flatMap((r) => r.items.filter((i) => i.stock).map((i) => ({ inventoryItem: i.stock._id, name: i.stock.name, unit: i.stock.unit, amount: i.amount }))),
      ...prescriptions.flatMap((p) => p.medications.filter((m) => m.stock).map((m) => ({ inventoryItem: m.stock._id, name: m.stock.name, unit: m.stock.unit, amount: m.dailyNeed }))),
    ];
    return {
      horse: h,
      stall: stalls.find((s) => String(s.horse) === String(h._id)) || null,
      trainingClearance: clearances.get(String(h._id)),
      rations: horseRations,
      prescriptions,
      shortages: shortagesFrom(needs, stock),
    };
  });
  return ok(res, sheets, 'Care plan fetched.');
});

/**
 * The groom taking a task on ("tiếp nhận"). Nothing changes for the horse; it tells the trainer,
 * manager and vet that someone has seen the order, before it is done. Idempotent.
 */
const acknowledgeTask = asyncHandler(async (req, res) => {
  const task = await loadTask(req, res);
  if (!task) return undefined;
  if (task.status !== 'pending') return fail(res, 'Công việc này đã được ghi nhận xong.', 409);
  if (taskTiming(task).state === 'missed') return fail(res, taskTiming(task).reason, 409);
  if (!task.acknowledgedAt) {
    task.acknowledgedAt = new Date();
    await task.save();
  }
  return ok(res, task, 'Task acknowledged.');
});

/**
 * The groom could not do the task — the horse would not take the medicine, the hoof was too sore
 * to wash. Recorded as skipped with the reason, and whoever ordered it is told: the vet (and
 * trainer) for a care order, the trainer for anything else. Without this the only options were a
 * false "done" or leaving it to look forgotten.
 */
const reportNotDone = asyncHandler(async (req, res) => {
  const task = await loadTask(req, res);
  if (!task) return undefined;
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) return fail(res, 'Hãy ghi rõ vì sao không thực hiện được.', 400);
  if (task.status !== 'pending') return fail(res, 'Công việc này đã được ghi nhận rồi.', 409);

  Object.assign(task, { status: 'skipped', skipReason: reason, skippedBy: req.user._id });
  if (!task.acknowledgedAt) task.acknowledgedAt = new Date();
  await task.save();

  const horse = await Horse.findById(task.horse).select('name');
  const what = `${TASK_LABELS[task.taskType] || task.taskType}${task.note ? ` (${task.note})` : ''}`;
  const alert = {
    horse: task.horse,
    type: task.source === 'vet' ? 'care_order' : 'task_assigned',
    severity: 'warning',
    message: `⚠️ ${req.user.name} không thực hiện được việc ${what} cho ${horse?.name || 'ngựa'}: ${reason}`,
  };
  if (task.source === 'vet') await notifyHorseStaff({ ...alert, staff: 'vet' });
  await notifyHorseStaff({ ...alert, staff: 'trainer' });
  await logAction({ actorId: req.user._id, action: 'dailyTask.not_done', targetModel: 'DailyTask', targetId: task._id, metadata: { reason } });

  return ok(res, task, 'Task marked as not done.');
});

/**
 * Incident reports as a working list rather than a line in the notification bell: a vet sees the
 * ones on their horses, a trainer likewise, a groom the ones they filed, the manager all of them.
 * ?status=open|acknowledged|resolved, or ?status=unresolved for everything still waiting on a vet.
 */
const listIncidents = asyncHandler(async (req, res) => {
  const filter = { 'incidentReport.description': { $exists: true } };
  const horse = await horseFilter(req.user, req.query.horse);
  if (horse !== undefined) filter.horse = horse;
  if (req.user.role === ROLES.GROOM) filter.assignedTo = req.user._id;

  const { status } = req.query;
  // Reports filed before incidents had a status carry none, and count as open.
  if (status === 'unresolved') filter['incidentReport.status'] = { $ne: 'resolved' };
  else if (status === 'open') filter['incidentReport.status'] = { $nin: ['acknowledged', 'resolved'] };
  else if (status) filter['incidentReport.status'] = status;

  const tasks = await DailyTask.find(filter)
    .populate('horse', 'name healthStatus')
    .populate('assignedTo', 'name')
    .populate('incidentReport.handledBy', 'name')
    .populate('incidentReport.healthRecord', 'diagnosis resultStatus date')
    .sort({ 'incidentReport.reportedAt': -1 })
    .limit(200);
  return ok(res, tasks, 'Incidents fetched.');
});

/**
 * The vet's answer to a report: "acknowledged" (I've seen it, I'm on it) or "resolved", with what
 * they found. Filing an exam for the horse resolves its open reports too (incident.service.js).
 */
const handleIncident = asyncHandler(async (req, res) => {
  const task = await loadTask(req, res);
  if (!task) return undefined;
  if (!task.incidentReport?.description) return fail(res, 'Công việc này không có báo cáo sự cố.', 404);
  if (task.incidentReport.status === 'resolved') return fail(res, 'Sự cố này đã được xử lý.', 409);

  const status = req.body.status === 'acknowledged' ? 'acknowledged' : 'resolved';
  const response = typeof req.body.response === 'string' ? req.body.response.trim() : '';
  if (status === 'resolved' && !response) return fail(res, 'Hãy ghi rõ đã xử lý thế nào.', 400);

  Object.assign(task.incidentReport, {
    status,
    handledBy: req.user._id,
    response: response || task.incidentReport.response,
    resolvedAt: status === 'resolved' ? new Date() : null,
  });
  await task.save();

  const horse = await Horse.findById(task.horse).select('name');
  await announceIncidentUpdate(task, { vetName: req.user.name, horseName: horse?.name || 'ngựa' });
  await logAction({
    actorId: req.user._id,
    action: `incident.${status}`,
    targetModel: 'DailyTask',
    targetId: task._id,
    metadata: { response },
  });
  return ok(res, task, 'Incident updated.');
});

module.exports = {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  reportIncident,
  listIncidents,
  handleIncident,
  acknowledgeTask,
  reportNotDone,
  myCarePlan,
};
