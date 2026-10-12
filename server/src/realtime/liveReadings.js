// The last readings of each running session, so a screen opened (or reopened) mid-run can draw the
// chart from where the run is instead of from nothing. In memory: a restart starts the chart again,
// while the session's own metrics (distance, averages, last heart rate and speed) stay in the database.
const KEEP = 40;
const buffers = new Map();

function pushReading(sessionId, reading) {
  const key = String(sessionId);
  const list = buffers.get(key) || [];
  list.push(reading);
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
  buffers.set(key, list);
}

const readingsOf = (sessionId) => buffers.get(String(sessionId)) || [];
const clearReadings = (sessionId) => buffers.delete(String(sessionId));

module.exports = { pushReading, readingsOf, clearReadings, KEEP };
