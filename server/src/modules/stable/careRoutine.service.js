const CareRoutine = require('../../models/CareRoutine');
const DailyTask = require('../../models/DailyTask');
const StableAssignment = require('../../models/StableAssignment');
const User = require('../../models/User');
const { ROLES } = require('../../constants/roles');
const { dayBounds, mealWindow, taskTiming } = require('../../utils/taskTiming');

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function atClock(dayStart, hhmm) {
  const d = new Date(dayStart);
  const [hh, mm] = String(hhmm).split(':').map(Number);
  d.setHours(hh, mm, 0, 0);
  return d;
}

/** Whether the routine is done on the day between start and end. */
function dueOn(routine, { start, end }) {
  if (routine.status !== 'active') return false;
  if (routine.startDate && dayBounds(routine.startDate).start >= end) return false;
  if (routine.endDate && dayBounds(routine.endDate).start < start) return false;
  return (routine.weekDays?.length ? routine.weekDays : ALL_DAYS).includes(start.getDay());
}

/** What the groom reads on each task: what it is, how long, and how. */
function routineNote(routine) {
  return [routine.taskType === 'other' && routine.title ? `${routine.title}.` : '', `Mỗi lần ${routine.durationMinutes} phút.`, routine.instructions].filter(Boolean).join(' ');
}

/** Who does it today: the groom named on it if still active, else the groom of the horse's stall. */
async function assigneeOf(routine) {
  if (routine.assignedTo && (await User.exists({ _id: routine.assignedTo, role: ROLES.GROOM, isActive: true }))) return routine.assignedTo;
  const assignment = await StableAssignment.findOne({ horse: routine.horse }).select('assignedCaretaker');
  return assignment?.assignedCaretaker || null;
}

/**
 * Brings today's tasks of a routine in line with it: one task per time of day while it is due, none
 * once it is stopped, over or not done that weekday. A task of today that no longer fits (its time
 * was taken out, the instructions changed) goes unless it was already done or missed; a time whose
 * window has closed is not created. Idempotent. Returns { created, removed }.
 */
async function syncRoutineTasks(routine, now = new Date()) {
  const bounds = dayBounds(now);
  const due = dueOn(routine, bounds);
  const note = routineNote(routine);
  const wanted = due ? [...new Set(routine.times)] : [];
  const assignee = due ? await assigneeOf(routine) : null;

  const pending = await DailyTask.find({ routine: routine._id, status: 'pending', scheduledDate: { $gte: bounds.start, $lt: bounds.end } });
  const stale = pending.filter((t) => taskTiming(t, now).state !== 'missed' && (!wanted.includes(t.dueTime) || t.note !== note || t.taskType !== routine.taskType));
  if (stale.length) await DailyTask.deleteMany({ _id: { $in: stale.map((t) => t._id) } });
  // Another groom named on the routine: today's open tasks go to them.
  const moved = pending.filter((t) => !stale.includes(t) && assignee && String(t.assignedTo) !== String(assignee));
  if (moved.length) await DailyTask.updateMany({ _id: { $in: moved.map((t) => t._id) } }, { $set: { assignedTo: assignee } });

  if (!wanted.length || !assignee) return { created: 0, removed: stale.length };
  let created = 0;
  for (const time of wanted) {
    const at = atClock(bounds.start, time);
    if (now > mealWindow(at, 60).closesAt) continue; // today's 07:00 is gone by evening
    // eslint-disable-next-line no-await-in-loop
    if (await DailyTask.exists({ routine: routine._id, dueTime: time, scheduledDate: { $gte: bounds.start, $lt: bounds.end } })) continue;
    // eslint-disable-next-line no-await-in-loop
    await DailyTask.create({
      horse: routine.horse,
      assignedTo: assignee,
      taskType: routine.taskType,
      source: 'trainer',
      routine: routine._id,
      note,
      dueTime: time,
      durationMinutes: routine.durationMinutes,
      scheduledDate: at,
      status: 'pending',
    });
    created += 1;
  }
  return { created, removed: stale.length };
}

/** Daily run: every routine in use gets today's tasks; ones stopped or ended lately are cleaned up. */
async function syncAllRoutineTasks(now = new Date()) {
  const since = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const routines = await CareRoutine.find({ $or: [{ status: 'active' }, { updatedAt: { $gte: since } }] });
  let created = 0;
  for (const routine of routines) {
    // eslint-disable-next-line no-await-in-loop
    created += (await syncRoutineTasks(routine, now)).created;
  }
  return created;
}

/** How many times the routine is done from its start to its end (null without an end). */
function occurrences(routine) {
  if (!routine.endDate) return null;
  const days = routine.weekDays?.length ? routine.weekDays : ALL_DAYS;
  let count = 0;
  for (let d = dayBounds(routine.startDate).start; d <= dayBounds(routine.endDate).start; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (days.includes(d.getDay())) count += 1;
  }
  return count * routine.times.length;
}

module.exports = { syncRoutineTasks, syncAllRoutineTasks, dueOn, routineNote, occurrences };
