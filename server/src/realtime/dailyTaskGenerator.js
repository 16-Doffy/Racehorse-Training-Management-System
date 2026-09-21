const StableAssignment = require('../models/StableAssignment');
const DailyTask = require('../models/DailyTask');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly is enough for day-granularity tasks

/**
 * Auto-generates today's routine "feeding" DailyTask for every horse that has a long-term
 * StableAssignment (horse -> caretaker), so the Head Trainer no longer has to manually assign the
 * one care task that's fully predictable every single day. Situational tasks (cleaning, bathing,
 * icing) stay manually assigned via StableAssignPage.jsx, since those depend on judgment calls
 * (dirty today? had a hard session today?) that this generator has no way to know.
 *
 * Runs on a periodic check rather than a once-a-day timer so it stays correct even if the server
 * restarts mid-day (common on Render's free tier, which sleeps after inactivity) — each check just
 * ensures today's task exists per assignment, so it's safe to run repeatedly without duplicating.
 */
function startDailyTaskGenerator() {
  console.log(`[daily-task-generator] started (checking every ${CHECK_INTERVAL_MS / 60000}min)`);

  const check = async () => {
    try {
      const assignments = await StableAssignment.find({ assignedCaretaker: { $ne: null } }).select(
        'horse assignedCaretaker'
      );
      if (assignments.length === 0) return;

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      for (const assignment of assignments) {
        const existing = await DailyTask.findOne({
          horse: assignment.horse,
          assignedTo: assignment.assignedCaretaker,
          taskType: 'feeding',
          scheduledDate: { $gte: dayStart, $lt: dayEnd },
        });
        if (existing) continue;

        // eslint-disable-next-line no-await-in-loop
        await DailyTask.create({
          horse: assignment.horse,
          assignedTo: assignment.assignedCaretaker,
          taskType: 'feeding',
          scheduledDate: dayStart,
          status: 'pending',
        });
      }
    } catch (err) {
      console.error('[daily-task-generator] check failed:', err.message);
    }
  };

  check(); // also run once immediately on startup, don't wait a full interval
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { startDailyTaskGenerator };
