// The suggested ration itself is worked out on the server (GET /feeding/suggest, rationRules.js).

/** "05:30": the latest a breakfast with concentrate should be given before a morning session. */
export function breakfastBy(sessionTime, digestMinutes) {
  if (!/^\d{2}:\d{2}$/.test(sessionTime || '')) return null;
  const [h, m] = sessionTime.split(':').map(Number);
  const at = h * 60 + m - digestMinutes;
  if (at < 0) return null;
  return `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`;
}
