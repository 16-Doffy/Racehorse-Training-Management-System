/**
 * One line per target the session was given, each with what was actually measured. Mirrors the
 * rules the server uses to decide `outcome.met` (trainingSession.controller.js computeOutcome):
 * speed and distance must reach the target, heart rate must stay under it.
 */
export function buildRows(session) {
  const p = session.prescription || {};
  const m = session.metrics || {};
  const rows = [
    { key: 'speed', label: 'Tốc độ', actual: m.maxSpeed, target: p.targetSpeedKmh, unit: 'km/h', digits: 1, atLeast: true },
    { key: 'heart', label: 'Nhịp tim', actual: m.avgHeartRate, target: p.targetHeartRateMax, unit: 'bpm', digits: 0, atLeast: false },
    // Every rep counts: the target of 3 × 1200 m is 3600 m.
    { key: 'distance', label: 'Cự ly', actual: m.distance, target: p.distanceM != null ? p.distanceM * (p.reps || 1) : undefined, unit: 'm', digits: 0, atLeast: true },
  ];
  return rows
    .filter((r) => r.actual != null || r.target != null)
    .map((r) => ({
      ...r,
      met: r.actual != null && r.target != null ? (r.atLeast ? r.actual >= r.target : r.actual <= r.target) : null,
    }));
}
