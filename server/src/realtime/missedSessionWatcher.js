const { markMissedSessions } = require('../modules/training/trainingSession.service');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Every few minutes, turns sessions nobody pre-checked or started in time into "missed" (see
 * markMissedSessions) so the trainer is told and can book them again.
 */
function startMissedSessionWatcher() {
  console.log(`[missed-sessions] started (checking every ${CHECK_INTERVAL_MS / 60000}min)`);
  const check = async () => {
    try {
      const marked = await markMissedSessions();
      if (marked) console.log(`[missed-sessions] ${marked} session(s) marked missed`);
    } catch (err) {
      console.error('[missed-sessions] check failed:', err.message);
    }
  };
  check();
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { startMissedSessionWatcher };
