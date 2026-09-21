const DailyTask = require('../../models/DailyTask');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { ROLES } = require('../../constants/roles');
const { pushNotification } = require('../alerts/notification.service');

const listTasks = asyncHandler(async (req, res) => {
  const { horse, assignedTo, status, date } = req.query;
  const filter = {};
  if (horse) filter.horse = horse;
  if (status) filter.status = status;
  // Grooms typically only need their own worklist; other roles can pass assignedTo explicitly.
  filter.assignedTo = assignedTo || (req.user.role === ROLES.GROOM ? req.user._id : undefined);
  if (filter.assignedTo === undefined) delete filter.assignedTo;
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
  const task = await DailyTask.create(req.body);
  return created(res, task, 'Daily task created.');
});

// Grooms may only act on tasks assigned to them, not on a colleague's worklist.
const isAssignee = (task, user) => String(task.assignedTo) === String(user._id);

const completeTask = asyncHandler(async (req, res) => {
  const task = await DailyTask.findById(req.params.id);
  if (!task) return fail(res, 'Daily task not found.', 404);
  if (!isAssignee(task, req.user)) return fail(res, 'Forbidden: this task is assigned to someone else.', 403);

  task.status = 'completed';
  task.completedAt = new Date();
  await task.save();
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

module.exports = { listTasks, getTask, createTask, completeTask, reportIncident };
