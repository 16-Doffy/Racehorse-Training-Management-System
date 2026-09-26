const DailyTask = require('../../models/DailyTask');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { ROLES } = require('../../constants/roles');
const { pushNotification } = require('../alerts/notification.service');
const { getScopedHorseIds, isHorseInScope } = require('../../utils/horseScope');

const listTasks = asyncHandler(async (req, res) => {
  const { horse, assignedTo, status, date } = req.query;
  const filter = {};

  // Same per-horse scoping as training and health: a Head Trainer or Vet sees the care work for
  // the horses assigned to them, not the whole club's worklist.
  const scopedIds = await getScopedHorseIds(req.user);
  if (horse) {
    filter.horse = isHorseInScope(scopedIds, horse) ? horse : { $in: [] };
  } else if (scopedIds) {
    filter.horse = { $in: scopedIds };
  }

  if (status) filter.status = status;

  // A Groom always gets their own worklist. Previously an explicit ?assignedTo= won over the role
  // default, which let one groom read a colleague's list by changing a query parameter.
  if (req.user.role === ROLES.GROOM) filter.assignedTo = req.user._id;
  else if (assignedTo) filter.assignedTo = assignedTo;
  if (date) {
    const day = new Date(date);
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

const getTask = asyncHandler(async (req, res) => {
  const task = await DailyTask.findById(req.params.id).populate('horse').populate('assignedTo', 'name');
  if (!task) return fail(res, 'Daily task not found.', 404);
  return ok(res, task, 'Daily task fetched.');
});

// Assigning daily task lists to the care team is the Head Trainer's job; Club Manager can too.
const createTask = asyncHandler(async (req, res) => {
  const scopedIds = await getScopedHorseIds(req.user);
  if (!isHorseInScope(scopedIds, req.body.horse)) {
    return fail(res, 'Forbidden: this horse is not assigned to you.', 403);
  }

  const task = await DailyTask.create(req.body);
  return created(res, task, 'Daily task created.');
});

// Whoever assigned the work can still change their mind: reassign it to a different Groom, move
// the date, or correct the task type. Without this, a mis-assigned task could only ever be worked
// around by creating a second one and leaving the wrong one sitting on someone's list forever.
const updateTask = asyncHandler(async (req, res) => {
  const { horse, assignedTo, taskType, scheduledDate, note } = req.body;
  const task = await DailyTask.findById(req.params.id);
  if (!task) return fail(res, 'Daily task not found.', 404);

  if (task.status === 'completed') {
    return fail(res, 'Không thể sửa công việc đã hoàn thành.', 409);
  }

  if (horse !== undefined) task.horse = horse;
  if (assignedTo !== undefined) task.assignedTo = assignedTo;
  if (taskType !== undefined) task.taskType = taskType;
  if (scheduledDate !== undefined) task.scheduledDate = scheduledDate;
  if (note !== undefined) task.note = note;

  await task.save();
  return ok(res, task, 'Daily task updated.');
});

// Cancelling an assignment outright (e.g. the horse left the stable, or the task was created by
// mistake) — completed work is kept, since deleting it would erase the record that it was done.
const deleteTask = asyncHandler(async (req, res) => {
  const task = await DailyTask.findById(req.params.id);
  if (!task) return fail(res, 'Daily task not found.', 404);

  if (task.status === 'completed') {
    return fail(res, 'Không thể xóa công việc đã hoàn thành — đây là bằng chứng công việc đã làm.', 409);
  }

  await task.deleteOne();
  return ok(res, null, 'Daily task deleted.');
});

// Grooms may only act on tasks assigned to them, not on a colleague's worklist.
const isAssignee = (task, user) => String(task.assignedTo) === String(user._id);

// Completing a task optionally carries what the groom observed while doing it. The body is
// entirely optional — an empty PATCH behaves exactly as it always did — because this shipped
// before the groom's screen had any field to collect it, and must not break that screen.
//
// It matters because the groom is the only person who sees the horse eat. Whether it cleaned up
// its feed, and when, is what the training readiness check reads to decide if the horse is fit to
// be worked (see modules/training/readiness.service.js).
const completeTask = asyncHandler(async (req, res) => {
  const { appetite, amountEatenPercent, behaviourNote } = req.body || {};
  const task = await DailyTask.findById(req.params.id);
  if (!task) return fail(res, 'Daily task not found.', 404);
  if (!isAssignee(task, req.user)) return fail(res, 'Forbidden: this task is assigned to someone else.', 403);

  task.status = 'completed';
  task.completedAt = new Date();

  if (appetite !== undefined || amountEatenPercent !== undefined || behaviourNote !== undefined) {
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
    const Horse = require('../../models/Horse');
    const horse = await Horse.findById(task.horse).select('name assignedVet');
    await pushNotification({
      recipientUser: horse?.assignedVet || undefined,
      recipientRole: horse?.assignedVet ? undefined : ROLES.VETERINARIAN,
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

  const task = await DailyTask.findById(req.params.id);
  if (!task) return fail(res, 'Daily task not found.', 404);
  if (!isAssignee(task, req.user)) return fail(res, 'Forbidden: this task is assigned to someone else.', 403);

  const images = (req.files || []).map((f) => `/uploads/incidents/${f.filename}`);

  task.incidentReport = { description, severity: severity || 'medium', images, reportedAt: new Date() };
  await task.save();

  const Horse = require('../../models/Horse');
  const horse = await Horse.findById(task.horse).select('name assignedVet');
  const horseName = horse?.name || 'Ngựa';

  await pushNotification({
    recipientUser: horse?.assignedVet || undefined,
    recipientRole: horse?.assignedVet ? undefined : ROLES.VETERINARIAN,
    horse: task.horse,
    type: 'incident_report',
    severity: severity === 'high' ? 'critical' : 'warning',
    message: `⚠️ Sự cố mới với ${horseName}: ${description}`,
  });

  return ok(res, task, 'Incident reported.');
});

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask, completeTask, reportIncident };
