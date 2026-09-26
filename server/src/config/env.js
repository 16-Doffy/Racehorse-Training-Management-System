require('dotenv').config();

// The club runs on Vietnam time, and a lot of logic means "today" or "06:00" in that sense: the
// daily feeding tasks, the readiness board's meal-gap check, day filters on the worklist. Render's
// machines run on UTC, where midnight is 07:00 in Vietnam — so without this, "today" rolled over
// at 7 AM and a 06:00 breakfast was scheduled for 13:00. Node honours TZ changes at runtime, and
// this module is loaded before anything computes a date.
// Assigned unconditionally (not '||') because some hosts export TZ=UTC explicitly.
process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh';

// CLIENT_URL may be a single origin or a comma-separated list — teammates each run their own
// local Vite dev server (normally all on http://localhost:5173, so one value is usually enough),
// but this also covers adding a deployed frontend origin later without code changes.
const clientOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wdp301_racehorse',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins,
  enableSensorSimulator: process.env.ENABLE_SENSOR_SIMULATOR === 'true',
};
