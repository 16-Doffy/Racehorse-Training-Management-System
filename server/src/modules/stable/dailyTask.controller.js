const DailyTask = require('../../models/DailyTask');
const Horse = require('../../models/Horse');
const User = require('../../models/User');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { ROLES } = require('../../constants/roles');
const { notifyHorseStaff } = require('../alerts/notification.service');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const pick = require('../../utils/pick');

const TASK_FIELDS = ['horse', 'assignedTo', 'taskType', 'mealSlot', 'scheduledDate', 'note'];

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

  const task = await DailyTask.create(body);
  return created(res, task, 'Daily task created.');
});

// Whoever assigned the work can still change their mind: reassign it to a different Groom, move
// the date, or correct the task type. Without this, a mis-assigned task could only ever be worked
// around by creating a second one and leaving the wrong one sitting on someone's list forever.
const updateTask = asyncHandler(async (req, res) => {
  const task = await loadTask(req, res);
  if (!task) return undefined;
  if (task.status === 'completed') return fail(res, 'Không thể sửa công việc đã hoàn thành.', 409);

  const changes = pick(req.body, TASK_FIELDS);
  if (changes.horse && !(await canAccessHorse(req.user, changes.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  if (changes.assignedTo && !(await isActiveGroom(changes.assignedTo))) {
    return fail(res, 'Người được giao phải là nhân viên chăm sóc đang hoạt động.', 400);
  }

  Object.assign(task, changes);
  await task.save();
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
  await task.deleteOne();
  return ok(res, null, 'Daily task deleted.');
});

// Completing a task optionally carries what the groom observed while doing it. The body is
// entirely optional — an empty PATCH behaves exactly as it always did — because this shipped
// before the groom's screen had any field to collect it, and must not break that screen.
//
// It matters because the groom is the only person who sees the horse eat. Whether it cleaned up
// its feed, and when, is what the training readiness check reads to decide if the horse is fit to
// be worked (see modules/training/readiness.service.js).
const completeTask = asyncHandler(async (req, res) => {
  const { appetite, amountEatenPercent, behaviourNote } = req.body || {};
  const task = await loadTask(req, res);
  if (!task) return undefined;

  // Marking tomorrow's feed as done today would record a meal the horse hasn't had.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (task.scheduledDate > endOfToday) return fail(res, 'Chưa tới ngày thực hiện công việc này.', 409);

  // The first completion time is when the horse actually ate; completing again (e.g. to add an
  // observation afterwards) must not move it, or the readiness board would see a meal that never
  // happened.
  if (task.status !== 'completed') {
    task.status = 'completed';
    task.completedAt = new Date();
  }

  const hasObservation = appetite !== undefined || amountEatenPercent !== undefined || behaviourNote !== undefined;
  if (hasObservation) {
    task.observation = {
      appetite: appetite ?? task.observation?.appetite ?? null,
      amountEatenPercent: amountEatenPercent ?? task.observation?.amountEatenPercent,
      behaviourNote: behaviourNote ?? task.observation?.behaviourNote,
      recordedAt: new Date(),
    };
  }
  await task.save();

  // A horse refusing its feed is one of the earliest signs something is wrong, and it should not
  // wait for someone to notice a row in a list.
  if (appetite === 'refused') {
    const horse = await Horse.findById(task.horse).select('name');
    await notifyHorseStaff({
      staff: 'vet',
      horse: task.horse,
      type: 'incident_report',
      severity: 'warning',
      message: `⚠️ ${horse?.name || 'Ngựa'} bỏ ăn trong bữa vừa rồi${behaviourNote ? `: ${behaviourNote}` : '.'}`,
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

  const horse = await Horse.findById(task.horse).select('name');
  await notifyHorseStaff({
    staff: 'vet',
    horse: task.horse,
    type: 'incident_report',
    severity: severity === 'high' ? 'critical' : 'warning',
    message: `⚠️ Sự cố mới với ${horse?.name || 'Ngựa'}: ${description}`,
  });

  return ok(res, task, 'Incident reported.');
});

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask, completeTask, reportIncident };
