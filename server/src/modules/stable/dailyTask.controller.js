const DailyTask = require('../../models/DailyTask');
const Horse = require('../../models/Horse');
const User = require('../../models/User');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { ROLES } = require('../../constants/roles');
const { notifyHorseStaff, pushNotification } = require('../alerts/notification.service');
const { logAction } = require('../audit/audit.service');
const { announceIncidentUpdate } = require('./incident.service');
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
  return ok(res, tasks, 'Daily tasks fetched.');
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

  const changes = pick(req.body, TASK_FIELDS);
  if (changes.taskType && !MANUAL_TASK_TYPES.includes(changes.taskType)) return fail(res, 'Loại công việc không hợp lệ.', 400);
  const previousAssignee = String(task.assignedTo);
  if (changes.horse && !(await canAccessHorse(req.user, changes.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  // "Skipped" is how an assigner calls off a meal or a chore on purpose (e.g. fasting a horse
  // before a race). It keeps the record — and stops the feeding generator from recreating it.
  if (req.body.status !== undefined) {
    if (req.body.status !== 'skipped') return fail(res, 'Chỉ có thể chuyển công việc sang "Đã bỏ qua".', 400);
    if (task.status !== 'pending') return fail(res, 'Chỉ bỏ qua được công việc chưa thực hiện.', 409);
    changes.status = 'skipped';
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

  // Marking tomorrow's feed as done today would record a meal the horse hasn't had.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (task.scheduledDate > endOfToday) return fail(res, 'Chưa tới ngày thực hiện công việc này.', 409);
  // A meal the trainer called off (e.g. fasting before a race) must not be recorded as eaten.
  if (task.status === 'skipped') return fail(res, 'Công việc này đã được HLV cho bỏ qua.', 409);

  // The first completion time is when the horse actually ate; completing again (e.g. to add an
  // observation afterwards) must not move it, or the readiness board would see a meal that never
  // happened.
  if (task.status !== 'completed') {
    task.status = 'completed';
    task.completedAt = new Date();
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

  const images = (req.files || []).map((f) => `/uploads/incidents/${f.filename}`);
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
};
