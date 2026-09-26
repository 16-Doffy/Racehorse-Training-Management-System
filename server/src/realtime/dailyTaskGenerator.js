const StableAssignment = require('../models/StableAssignment');
const FeedingSchedule = require('../models/FeedingSchedule');
const DailyTask = require('../models/DailyTask');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly is enough for day-granularity tasks

// Used when a horse has an approved ration for a slot but nobody set a clock time on it.
const DEFAULT_MEAL_TIMES = { morning: '06:00', noon: '11:30', evening: '17:30' };

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function atClock(dayStart, hhmm) {
  const d = new Date(dayStart);
  const [hh, mm] = String(hhmm || '').split(':').map(Number);
  if (Number.isFinite(hh) && Number.isFinite(mm)) d.setHours(hh, mm, 0, 0);
  return d;
}

/**
 * Makes sure today's feeding tasks exist for the given horses (all stabled horses when omitted).
 *
 * One task per meal from the horse's ration, with the meal's clock time — not one untimed task per
 * day, since the training readiness check needs to know how long ago the horse actually ate.
 * A horse with no ration on file gets a single daily task, as before, rather than three meals the
 * stable never agreed to.
 *
 * `onlyUpcoming` is for mid-day triggers (a ration was just saved, a groom was just assigned):
 * creating a 06:00 task at 15:00 would only produce an instantly-overdue item.
 *
 * Idempotent: safe to run on every tick and after every restart.
 */
async function ensureFeedingTasks({ horseIds, onlyUpcoming = false } = {}) {
  const assignmentFilter = { assignedCaretaker: { $ne: null } };
  if (horseIds) assignmentFilter.horse = { $in: horseIds };

  const assignments = await StableAssignment.find(assignmentFilter).select('horse assignedCaretaker');
  if (assignments.length === 0) return 0;

  const { start, end } = todayBounds();
  const now = new Date();
  const schedules = await FeedingSchedule.find({ horse: { $in: assignments.map((a) => a.horse) } }).select(
    'horse mealTime timeOfDay'
  );

  let createdCount = 0;
  for (const assignment of assignments) {
    const meals = schedules.filter((s) => String(s.horse) === String(assignment.horse));
    const slots = meals.length
      ? meals.map((m) => ({ mealSlot: m.mealTime, at: atClock(start, m.timeOfDay || DEFAULT_MEAL_TIMES[m.mealTime]) }))
      : [{ mealSlot: null, at: start }];

    for (const slot of slots) {
      if (onlyUpcoming && slot.mealSlot && slot.at < now) continue;

      // eslint-disable-next-line no-await-in-loop
      const exists = await DailyTask.exists({
        horse: assignment.horse,
        taskType: 'feeding',
        mealSlot: slot.mealSlot,
        scheduledDate: { $gte: start, $lt: end },
      });
      if (exists) continue;

      // eslint-disable-next-line no-await-in-loop
      await DailyTask.create({
        horse: assignment.horse,
        assignedTo: assignment.assignedCaretaker,
        taskType: 'feeding',
        mealSlot: slot.mealSlot,
        scheduledDate: slot.at,
        status: 'pending',
      });
      createdCount += 1;
    }

    // Once a horse has per-meal tasks, a leftover generic "feed the horse" task for today is a
    // duplicate — and a pending one would make the nutrition check think a meal was skipped.
    if (meals.length) {
      // eslint-disable-next-line no-await-in-loop
      await DailyTask.deleteMany({
        horse: assignment.horse,
        taskType: 'feeding',
        mealSlot: null,
        status: 'pending',
        scheduledDate: { $gte: start, $lt: end },
      });
    }
  }

  return createdCount;
}

/**
 * Hourly background run, so the day's tasks appear without anyone asking. Runs on a periodic check
 * rather than a once-a-day timer so it stays correct if the server restarts mid-day (Render's free
 * tier sleeps after inactivity).
 *
 * Situational tasks (cleaning) stay manually assigned; post-training icing/bathing are created by
 * the session evaluation, since only that knows how hard the horse actually worked.
 */
function startDailyTaskGenerator() {
  console.log(`[daily-task-generator] started (checking every ${CHECK_INTERVAL_MS / 60000}min)`);

  const check = async () => {
    try {
      await ensureFeedingTasks();
    } catch (err) {
      console.error('[daily-task-generator] check failed:', err.message);
    }
  };

  check(); // also run once immediately on startup, don't wait a full interval
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { startDailyTaskGenerator, ensureFeedingTasks };
