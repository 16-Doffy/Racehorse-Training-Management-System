const { scheduleActivePlans } = require('../modules/training/trainingPlan.service');
const { remindRationReviews } = require('../modules/feeding/planRations.service');

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Every hour (and at start-up), keeps each active plan's sessions booked for this week and next
 * (see scheduleAhead), so a new week appears on the calendar without anyone generating it.
 */
function startPlanScheduler() {
  console.log(`[plan-scheduler] started (checking every ${CHECK_INTERVAL_MS / 60000}min)`);
  const check = async () => {
    try {
      const created = await scheduleActivePlans();
      if (created) console.log(`[plan-scheduler] ${created} session(s) booked ahead`);
      // A phase change coming: the trainer confirms the new phase's suggested rations.
      const told = await remindRationReviews();
      if (told) console.log(`[plan-scheduler] ${told} ration review reminder(s)`);
    } catch (err) {
      console.error('[plan-scheduler] check failed:', err.message);
    }
  };
  check();
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { startPlanScheduler };
