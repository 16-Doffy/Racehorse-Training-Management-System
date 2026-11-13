const { SESSION_KINDS } = require('../constants/training');

const FALLBACK = { targetSpeedKmh: 35, targetHeartRateMax: 180, distanceM: 2000, reps: 1 };
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Builds the sequential workout timeline when a session combines multiple segments
 * (`warm-up -> main work -> cool-down`), giving each segment cumulative `[startDistance, endDistance)` bounds.
 */
function buildSegmentTimeline(segments = []) {
  let cursor = 0;
  let totalDurationMinutes = 0;
  const timeline = [];
  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];
    if (!seg?.kind) continue;
    const kindDef = SESSION_KINDS[seg.kind] || {};
    const kindRx = kindDef.prescription || {};
    const speed = Number(seg.targetSpeedKmh) || kindRx.targetSpeedKmh || FALLBACK.targetSpeedKmh;
    const heartRateMax = Number(seg.targetHeartRateMax) || kindRx.targetHeartRateMax || FALLBACK.targetHeartRateMax;
    const durationMinutes =
      Number(seg.durationMinutes) ||
      kindRx.durationMinutes ||
      (Number(seg.distanceM) > 0 ? Math.max(5, Math.round(Number(seg.distanceM) / ((speed * 1000) / 60))) : 15);

    let distance;
    if (Number(seg.distanceM) > 0) {
      distance = Math.round(Number(seg.distanceM));
    } else if (kindRx.distanceM) {
      distance = kindRx.durationMinutes
        ? Math.max(200, Math.round(kindRx.distanceM * (durationMinutes / kindRx.durationMinutes)))
        : kindRx.distanceM * (kindRx.reps ?? 1);
    } else {
      distance = Math.max(200, Math.round((speed / 3.6) * durationMinutes * 60));
    }

    const startDistance = cursor;
    cursor += distance;
    totalDurationMinutes += durationMinutes;
    timeline.push({
      index: timeline.length,
      kind: seg.kind,
      label: kindDef.label || seg.kind,
      note: seg.note || null,
      speed,
      heartRateMax,
      durationMinutes,
      distance,
      startDistance,
      endDistance: cursor,
    });
  }
  return { timeline, totalDistance: cursor, totalDurationMinutes };
}

/**
 * Computes per-segment performance from trace readings (and falls back gracefully when closed manually
 * without sensor readings). Used at run close so trainers see how the horse performed in each exercise
 * (including HR recovery on cool-down walk segments) rather than only a blended session average.
 */
function evaluateSegmentOutcomes(segments = [], trace = [], fallbackMetrics = {}) {
  const { timeline } = buildSegmentTimeline(segments);
  if (!timeline.length) return [];

  const points = Array.isArray(trace) ? [...trace].sort((a, b) => Number(a?.distance || 0) - Number(b?.distance || 0)) : [];
  const totalCovered = Number(fallbackMetrics?.distance ?? (points.length ? points[points.length - 1].distance : 0)) || 0;
  const results = [];

  for (let i = 0; i < timeline.length; i++) {
    const seg = timeline[i];
    const segPoints = points.filter((p) => {
      const d = Number(p?.distance || 0);
      return d > seg.startDistance && d <= seg.endDistance;
    });
    // The final reading may land exactly at 0 for index 0 before moving; include d === 0 on segment 0 if needed.
    if (i === 0) {
      for (const p of points) {
        if (Number(p?.distance || 0) === 0 && !segPoints.includes(p)) segPoints.unshift(p);
      }
    }

    const covered = Math.max(0, Math.min(seg.distance, totalCovered - seg.startDistance));
    let actualMaxSpeedKmh = null;
    let actualAvgHeartRate = null;
    let actualLastHeartRate = null;

    if (segPoints.length > 0) {
      const speeds = segPoints.map((p) => Number(p.speed)).filter(Number.isFinite);
      const hrs = segPoints.map((p) => Number(p.hr)).filter(Number.isFinite);
      if (speeds.length) actualMaxSpeedKmh = round1(Math.max(...speeds));
      if (hrs.length) {
        actualAvgHeartRate = round1(hrs.reduce((a, b) => a + b, 0) / hrs.length);
        actualLastHeartRate = Math.round(hrs[hrs.length - 1]);
      }
    }

    const prev = results[i - 1];
    let recoveryDropBpm = null;
    if (seg.kind === 'walk' && prev && prev.kind !== 'walk' && prev.actualAvgHeartRate != null && actualLastHeartRate != null) {
      recoveryDropBpm = Math.round(prev.actualAvgHeartRate - actualLastHeartRate);
    }

    let met = null;
    if (segPoints.length > 0) {
      const distOk = covered >= Math.round(seg.distance * 0.9);
      const hrOk = actualAvgHeartRate == null || actualAvgHeartRate <= seg.heartRateMax;
      // Recovery/warm-up walks focus on distance + keeping HR under ceiling rather than sprint top speed.
      const speedOk = seg.kind === 'walk' ? true : actualMaxSpeedKmh == null || actualMaxSpeedKmh >= seg.speed;
      met = distOk && hrOk && speedOk;
    }

    results.push({
      index: seg.index,
      kind: seg.kind,
      label: seg.label,
      note: seg.note,
      durationMinutes: seg.durationMinutes,
      targetDistanceM: seg.distance,
      targetSpeedKmh: seg.speed,
      targetHeartRateMax: seg.heartRateMax,
      actualDistanceM: Math.round(covered),
      actualMaxSpeedKmh,
      actualAvgHeartRate,
      actualLastHeartRate,
      recoveryDropBpm,
      met,
    });
  }

  return results;
}

module.exports = { buildSegmentTimeline, evaluateSegmentOutcomes, FALLBACK };
