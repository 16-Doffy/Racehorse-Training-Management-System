const StableAssignment = require('../models/StableAssignment');
const FeedingSchedule = require('../models/FeedingSchedule');
const FeedingCalendarDay = require('../models/FeedingCalendarDay');
const TrainingPlan = require('../models/TrainingPlan');
const DailyTask = require('../models/DailyTask');
const { syncAllCareTasks } = require('../modules/health/treatmentCare.service');
const { syncAllRoutineTasks } = require('../modules/stable/careRoutine.service');
const { mealWindow } = require('../utils/taskTiming');
const { warnLowStock } = require('../modules/inventory/stock.service');
const { closeArchivedLeftovers } = require('../modules/horses/archive.service');

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
 * A meal whose window has already closed today is not created (utils/taskTiming.js): the server
 * waking at 23:00 used to fill the groom's list with that morning's breakfast and lunch, born
 * overdue and impossible to record honestly. Tomorrow's run creates them on time.
 *
 * Idempotent: safe to run on every tick and after every restart.
 */
async function ensureFeedingTasks({ horseIds } = {}) {
  const assignmentFilter = { assignedCaretaker: { $ne: null } };
  if (horseIds) assignmentFilter.horse = { $in: horseIds };

  const assignments = await StableAssignment.find(assignmentFilter).select('horse assignedCaretaker');
  if (assignments.length === 0) return 0;

  const { start, end } = todayBounds();
  const now = new Date();
  const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  const calendarDays = await FeedingCalendarDay.find({ horse: { $in: assignments.map((a) => a.horse) }, date });
  const activePlans = await TrainingPlan.find({ _id: { $in: calendarDays.map((d) => d.plan) }, status: 'active' }).select('_id');
  const activeIds = new Set(activePlans.map((p) => String(p._id)));
  const calendarByHorse = new Map(calendarDays.filter((d) => activeIds.has(String(d.plan))).map((d) => [String(d.horse), d]));
  const schedules = await FeedingSchedule.find({ horse: { $in: assignments.map((a) => a.horse) } }).select(
    'horse mealTime timeOfDay items upcoming approvedBy'
  );
  // Amounts confirmed ahead for a plan's next phase take over on their day, before today's meals are made.
  for (const schedule of schedules) {
    if (calendarByHorse.has(String(schedule.horse))) continue;
    if (!schedule.upcoming?.from || new Date(schedule.upcoming.from) > now) continue;
    schedule.items = schedule.upcoming.items;
    if (schedule.upcoming.approvedBy) schedule.approvedBy = schedule.upcoming.approvedBy;
    schedule.upcoming = null;
    // eslint-disable-next-line no-await-in-loop
    await schedule.save();
    // A meal of today already on the groom's list takes the new amounts too.
    // eslint-disable-next-line no-await-in-loop
    await DailyTask.updateMany(
      { horse: schedule.horse, taskType: 'feeding', mealSlot: schedule.mealTime, status: 'pending', makeUpOf: null, scheduledDate: { $gte: start, $lt: end } },
      { $set: { supplies: (schedule.items || []).filter((i) => i.inventoryItem && i.amount).map((i) => ({ inventoryItem: i.inventoryItem, name: i.type, amount: i.amount, unit: i.unit })) } }
    );
  }

  let createdCount = 0;
  for (const assignment of assignments) {
    const calendar = calendarByHorse.get(String(assignment.horse));
    const meals = schedules.filter((s) => String(s.horse) === String(assignment.horse));
    if (calendar) {
      for (const meal of calendar.meals) {
        let ration = meals.find((s) => s.mealTime === meal.slot);
        if (!ration) {
          ration = new FeedingSchedule({ horse: assignment.horse, mealTime: meal.slot });
          meals.push(ration);
        }
        const items = meal.items.map((i) => ({ type: i.name, quantity: `${i.amount} ${i.unit}`, inventoryItem: i.inventoryItem, amount: i.amount, unit: i.unit }));
        const same = ration.timeOfDay === meal.time && JSON.stringify(ration.items.map((i) => `${i.inventoryItem}:${i.amount}`)) === JSON.stringify(items.map((i) => `${i.inventoryItem}:${i.amount}`));
        if (!same || !ration.approvedBy || ration.upcoming) {
          ration.timeOfDay = meal.time;
          ration.items = items;
          ration.approvedBy = calendar.approvedBy;
          ration.upcoming = null;
          // eslint-disable-next-line no-await-in-loop
          await ration.save();
        }
      }
    }
    const slots = calendar ? calendar.meals.map((m) => ({
      mealSlot: m.slot,
      at: atClock(start, m.time),
      supplies: m.items.map((i) => ({ inventoryItem: i.inventoryItem, name: i.name, amount: i.amount, unit: i.unit })),
    })) : meals.length
      ? meals.map((m) => ({
          mealSlot: m.mealTime,
          at: atClock(start, m.timeOfDay || DEFAULT_MEAL_TIMES[m.mealTime]),
          // The ration's stock items: feeding the horse takes them out of stock.
          supplies: (m.items || [])
            .filter((i) => i.inventoryItem && i.amount)
            .map((i) => ({ inventoryItem: i.inventoryItem, name: i.type, amount: i.amount, unit: i.unit })),
        }))
      : [{ mealSlot: null, at: start, supplies: [] }];

    for (const slot of slots) {
      if (slot.mealSlot && now > mealWindow(slot.at).closesAt) continue;

      // eslint-disable-next-line no-await-in-loop
      const exists = await DailyTask.exists({
        horse: assignment.horse,
        taskType: 'feeding',
        mealSlot: slot.mealSlot,
        makeUpOf: null,
        scheduledDate: { $gte: start, $lt: end },
      });
      if (exists) {
        if (calendar) {
          // A newly confirmed calendar can change an open meal, never one already done or missed.
          // eslint-disable-next-line no-await-in-loop
          const pending = await DailyTask.findOne({ horse: assignment.horse, taskType: 'feeding', mealSlot: slot.mealSlot, makeUpOf: null, status: 'pending', scheduledDate: { $gte: start, $lt: end } });
          if (pending && pending.timing.state !== 'missed') {
            if (pending.scheduledDate.getTime() !== slot.at.getTime()) pending.dueNotifiedAt = null;
            pending.scheduledDate = slot.at;
            pending.supplies = slot.supplies;
            // eslint-disable-next-line no-await-in-loop
            await pending.save();
          }
        }
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await DailyTask.create({
        horse: assignment.horse,
        assignedTo: assignment.assignedCaretaker,
        taskType: 'feeding',
        source: 'system',
        mealSlot: slot.mealSlot,
        scheduledDate: slot.at,
        supplies: slot.supplies,
        status: 'pending',
      });
      createdCount += 1;
    }

    // Once a horse has per-meal tasks, a leftover generic "feed the horse" task for today is a
    // duplicate — and a pending one would make the nutrition check think a meal was skipped.
    if (meals.length || calendar) {
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
      // A horse the club stopped managing leaves no exam request or treatment open (before the care
      // orders are synced, so a closed treatment's pending doses go too).
      await closeArchivedLeftovers();
      // The vet's care orders repeat every day a treatment is ongoing, like meals do.
      await syncAllCareTasks();
      // So do the jobs the trainer handed out for a stretch of days.
      await syncAllRoutineTasks();
      // Stock that runs out within days is announced before it stops a meal or a dose.
      await warnLowStock();
    } catch (err) {
      console.error('[daily-task-generator] check failed:', err.message);
    }
  };

  check(); // also run once immediately on startup, don't wait a full interval
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { startDailyTaskGenerator, ensureFeedingTasks, atClock, DEFAULT_MEAL_TIMES };
