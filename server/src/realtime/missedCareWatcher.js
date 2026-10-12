const { notifyMissedDoses } = require('../modules/stable/missedCare.service');

const CHECK_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Every few minutes, tells the vet about doses and checks they ordered whose window closed with
 * nobody recording them (see notifyMissedDoses). Each task is reported once.
 */
function startMissedCareWatcher() {
  console.log(`[missed-care] started (checking every ${CHECK_INTERVAL_MS / 60000}min)`);
  const check = async () => {
    try {
      const told = await notifyMissedDoses();
      if (told) console.log(`[missed-care] vet told about ${told} missed dose(s)`);
    } catch (err) {
      console.error('[missed-care] check failed:', err.message);
    }
  };
  check();
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { startMissedCareWatcher };
