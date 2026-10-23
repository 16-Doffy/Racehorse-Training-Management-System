const { notifyMissedDoses, notifyMissedMeals, notifyDueMeals } = require('../modules/stable/missedCare.service');

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const DUE_INTERVAL_MS = 60 * 1000;

/**
 * Every few minutes: doses and checks the vet ordered whose window closed unrecorded go to the vet
 * (notifyMissedDoses); meals whose window closed unrecorded go to the trainer and the groom
 * (notifyMissedMeals). Each task is reported once.
 */
function startMissedCareWatcher() {
  console.log(`[missed-care] started (checking every ${CHECK_INTERVAL_MS / 60000}min)`);
  const check = async () => {
    try {
      const doses = await notifyMissedDoses();
      if (doses) console.log(`[missed-care] vet told about ${doses} missed dose(s)`);
      const meals = await notifyMissedMeals();
      if (meals) console.log(`[missed-care] trainer told about ${meals} missed meal(s)`);
    } catch (err) {
      console.error('[missed-care] check failed:', err.message);
    }
  };
  check();
  setInterval(check, CHECK_INTERVAL_MS);
  const dueCheck = async () => {
    try {
      const due = await notifyDueMeals();
      if (due) console.log(`[meal-due] groom told about ${due} due meal(s)`);
    } catch (err) {
      console.error('[meal-due] check failed:', err.message);
    }
  };
  dueCheck();
  setInterval(dueCheck, DUE_INTERVAL_MS);
}

module.exports = { startMissedCareWatcher };
