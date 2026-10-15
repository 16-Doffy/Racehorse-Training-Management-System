import dayjs from 'dayjs';

// The ranges the owner can pick for the training chart, and what `GET /reports/training-chart` takes for
// each: `months` (1–24, by month) or `days` (7–90, by day).
export const CHART_RANGES = [
  { value: '12months', label: '12 tháng gần nhất', params: () => ({ months: 12 }), period: 'trong 12 tháng qua' },
  { value: '6months', label: '6 tháng gần nhất', params: () => ({ months: 6 }), period: 'trong 6 tháng qua' },
  { value: '30days', label: '30 ngày qua', params: () => ({ days: 30 }), period: 'trong 30 ngày qua' },
  // The API has no "this year": January up to now is the current month number of months.
  { value: 'this_year', label: 'Năm nay', params: () => ({ months: dayjs().month() + 1 }), period: 'từ đầu năm' },
];

export const chartRange = (value) => CHART_RANGES.find((r) => r.value === value) || CHART_RANGES[1];

/**
 * The chart's rows from the API answer { granularity, months, totals: [{ month, sessions, avgRating,
 * avgMaxSpeed, totalDistance, metTargets }], series }. Only sessions that were finished are counted.
 */
export function trainingChartRows(payload) {
  const totals = payload?.totals || [];
  const byDay = payload?.granularity === 'day';
  return totals.map((t) => ({
    key: t.month,
    label: byDay ? dayjs(t.month).format('DD/MM') : dayjs(`${t.month}-01`).format('MM/YY'),
    sessions: t.sessions,
    metGoals: t.metTargets,
    avgScore: t.avgRating,
    avgSpeed: t.avgMaxSpeed,
    distance: t.totalDistance,
  }));
}

/** Sessions and sessions that met their targets, summed over the rows. */
export function trainingChartTotals(rows) {
  const sessions = rows.reduce((sum, r) => sum + (r.sessions || 0), 0);
  const met = rows.reduce((sum, r) => sum + (r.metGoals || 0), 0);
  return { sessions, met, rate: sessions ? Math.round((met / sessions) * 100) : null };
}
