const Horse = require('../../models/Horse');
const DailyTask = require('../../models/DailyTask');
const FeedingSchedule = require('../../models/FeedingSchedule');
const FeedingCalendarDay = require('../../models/FeedingCalendarDay');
const TrainingPlan = require('../../models/TrainingPlan');
const StableAssignment = require('../../models/StableAssignment');
const { DEFAULT_MEAL_TIMES } = require('../../realtime/dailyTaskGenerator');
const { dateKey } = require('./feedingCalendar.service');

const SLOTS = ['morning', 'noon', 'evening'];
const pad = (n) => String(n).padStart(2, '0');
const clockOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayAfter = (d, n = 1) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
/** Monday 00:00 of the week containing the date. */
const mondayOf = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return dayAfter(x, -((x.getDay() + 6) % 7));
};
const lines = (items) => (items || []).filter((i) => i.amount).map((i) => ({ name: i.name || i.type, amount: i.amount, unit: i.unit }));

/** A meal on the groom's list, as the timetable shows it. */
function fromTask(task, makeUp) {
  const timing = task.timing;
  const status = task.status === 'completed' ? 'fed' : task.status === 'skipped' ? 'skipped' : timing.state === 'missed' ? 'missed' : timing.state;
  return {
    slot: task.mealSlot,
    time: clockOf(task.scheduledDate),
    items: lines(task.supplies),
    source: 'task',
    status, // fed | skipped | missed | upcoming | open | late
    doneAt: task.completedAt || null,
    doneBy: task.status === 'completed' ? (task.completedBy || task.assignedTo)?.name || null : task.skippedBy?.name || null,
    reason: task.skipReason || null,
    makeUp: makeUp
      ? { status: makeUp.status === 'completed' ? 'fed' : makeUp.status === 'skipped' ? 'skipped' : makeUp.timing.state, time: clockOf(makeUp.scheduledDate), doneAt: makeUp.completedAt || null, doneBy: (makeUp.completedBy || makeUp.assignedTo)?.name || null }
      : null,
  };
}

/**
 * One horse's feeding week, meal by meal, Monday first: what it eats and what happened.
 * - Today and before: the meal on the groom's list (DailyTask) and its outcome; a make-up meal goes
 *   with the meal it makes up for.
 * - Days ahead, as the daily generator will make them: the day of the active plan's confirmed feeding
 *   calendar if there is one, else the standing ration (amounts confirmed ahead for the next phase
 *   take over from their day). Only an approved ration is fed.
 * Returns { horse, caretaker, weekStart, days: [{ date, meals: [{ slot, time, items, source, status,
 * doneAt, doneBy, reason, makeUp }] }] }; a slot with nothing is { slot, status: null }.
 */
async function feedingTimetable({ horseId, week }) {
  const start = mondayOf(week || new Date());
  const end = dayAfter(start, 7);
  const [horse, assignment, tasks, rations, calendarDays] = await Promise.all([
    Horse.findById(horseId).select('name'),
    StableAssignment.findOne({ horse: horseId }).populate('assignedCaretaker', 'name'),
    DailyTask.find({ horse: horseId, taskType: 'feeding', mealSlot: { $ne: null }, scheduledDate: { $gte: start, $lt: end } })
      .populate('assignedTo', 'name')
      .populate('completedBy', 'name')
      .populate('skippedBy', 'name'),
    FeedingSchedule.find({ horse: horseId }).select('mealTime timeOfDay items upcoming approvedBy'),
    FeedingCalendarDay.find({ horse: horseId, date: { $gte: dateKey(start), $lt: dateKey(end) } }),
  ]);
  const activePlans = await TrainingPlan.find({ _id: { $in: calendarDays.map((d) => d.plan) }, status: 'active' }).select('_id');
  const active = new Set(activePlans.map((p) => String(p._id)));
  const calendarByDate = new Map(calendarDays.filter((d) => active.has(String(d.plan))).map((d) => [d.date, d]));

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const planned = (day, slot) => {
    const confirmed = calendarByDate.get(dateKey(day));
    if (confirmed) {
      const meal = confirmed.meals.find((m) => m.slot === slot);
      return meal ? { slot, time: meal.time, items: lines(meal.items), source: 'calendar', status: 'planned' } : { slot, status: null };
    }
    const ration = rations.find((r) => r.mealTime === slot);
    if (!ration?.approvedBy) return { slot, status: null };
    const ahead = ration.upcoming?.from && new Date(ration.upcoming.from) < dayAfter(day);
    return { slot, time: ration.timeOfDay || DEFAULT_MEAL_TIMES[slot], items: lines(ahead ? ration.upcoming.items : ration.items), source: 'ration', status: 'planned' };
  };

  const days = [];
  for (let day = new Date(start); day < end; day = dayAfter(day)) {
    const next = dayAfter(day);
    const ofDay = tasks.filter((t) => t.scheduledDate >= day && t.scheduledDate < next);
    const meals = SLOTS.map((slot) => {
      const task = ofDay.find((t) => t.mealSlot === slot && !t.makeUpOf);
      if (task) return fromTask(task, ofDay.find((t) => String(t.makeUpOf) === String(task._id)));
      if (day < today) return { slot, status: null };
      // Today, a meal not on the list yet is still to come only if its time is ahead.
      const meal = planned(day, slot);
      if (day.getTime() === today.getTime() && meal.time && meal.time <= clockOf(now)) return { slot, status: null };
      return meal;
    });
    days.push({ date: dateKey(day), meals });
  }
  return {
    horse: horse ? { _id: horse._id, name: horse.name } : null,
    caretaker: assignment?.assignedCaretaker ? { _id: assignment.assignedCaretaker._id, name: assignment.assignedCaretaker.name } : null,
    weekStart: dateKey(start),
    days,
  };
}

module.exports = { feedingTimetable, mondayOf };
