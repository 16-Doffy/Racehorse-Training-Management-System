const TrainingSession = require('../../models/TrainingSession');
const FinancialRecord = require('../../models/FinancialRecord');
const RaceEntry = require('../../models/RaceEntry');
const DailyTask = require('../../models/DailyTask');
const ExamRequest = require('../../models/ExamRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, fail } = require('../../utils/apiResponse');
const { horseFilter } = require('../../utils/horseScope');
const { SESSION_DONE_STATUSES, SESSION_NOT_DONE_STATUSES } = require('../../constants/training');
const { parsePeriodQuery, emptyPeriods, foldRecords } = require('../finance/financeSeries');

/** Builds a { $gte, $lte } range filter from optional `from`/`to` query params, or {} if neither given. */
function dateRangeFilter(from, to) {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return Object.keys(range).length ? range : null;
}

/**
 * How well the hand-offs between trainer, vet and groom are working: are the grooms' incident
 * reports being answered and how fast, are the vet's care orders being carried out, and how often
 * a session's numbers made the system ask for an exam on its own.
 */
async function buildCareCoordination(range) {
  const [incidentTasks, vetTasks, autoExamRequests] = await Promise.all([
    DailyTask.find({
      'incidentReport.description': { $exists: true },
      ...(range ? { 'incidentReport.reportedAt': range } : {}),
    }).select('incidentReport'),
    DailyTask.aggregate([
      { $match: { source: 'vet', ...(range ? { scheduledDate: range } : {}) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    ExamRequest.countDocuments({ trainingSession: { $ne: null }, ...(range ? { createdAt: range } : {}) }),
  ]);

  const byStatus = { open: 0, acknowledged: 0, resolved: 0 };
  const hoursToResolve = [];
  for (const { incidentReport: r } of incidentTasks) {
    byStatus[r.status || 'open'] += 1;
    if (r.status === 'resolved' && r.resolvedAt && r.reportedAt) {
      hoursToResolve.push((r.resolvedAt - r.reportedAt) / (60 * 60 * 1000));
    }
  }
  const vetByStatus = Object.fromEntries(vetTasks.map((t) => [t._id, t.count]));

  return {
    incidents: {
      reported: incidentTasks.length,
      byStatus,
      avgHoursToResolve: hoursToResolve.length
        ? Number((hoursToResolve.reduce((a, b) => a + b, 0) / hoursToResolve.length).toFixed(1))
        : null,
    },
    vetCareTasks: {
      assigned: vetTasks.reduce((sum, t) => sum + t.count, 0),
      completed: vetByStatus.completed || 0,
      pending: vetByStatus.pending || 0,
    },
    autoExamRequests,
  };
}

// Club Manager's "báo cáo tổng quan": training performance, operating costs, and race
// revenue/participation, optionally scoped to a period via ?from=&to= (ISO dates). Nothing here
// is stored — it's computed fresh from TrainingSession/FinancialRecord/RaceEntry on every call.
const getOverview = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const range = dateRangeFilter(from, to);

  const sessionFilter = range ? { scheduledAt: range } : {};
  const financeFilter = range ? { date: range } : {};
  const raceFilter = range ? { raceDate: range } : {};

  const [sessionStats, ratingAgg, financeAgg, raceStats, overrideRows, outcomeAgg] = await Promise.all([
    TrainingSession.aggregate([
      { $match: sessionFilter },
      // Before runs could be aborted, stopping one marked it cancelled: a cancelled session that had
      // started is counted as stopped part-way, not as a booking called off.
      {
        $group: {
          _id: { $cond: [{ $and: [{ $eq: ['$status', 'cancelled'] }, { $gt: ['$actualStartAt', null] }] }, 'aborted', '$status'] },
          count: { $sum: 1 },
        },
      },
    ]),
    TrainingSession.aggregate([
      { $match: { ...sessionFilter, performanceRating: { $ne: null } } },
      { $group: { _id: null, avgRating: { $avg: '$performanceRating' }, ratedCount: { $sum: 1 } } },
    ]),
    FinancialRecord.aggregate([
      { $match: financeFilter },
      { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' } } },
    ]),
    RaceEntry.aggregate([
      { $match: raceFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // Sessions the trainer went ahead with despite an amber readiness gate. This is the manager's
    // view of whether the safety checks are being respected or routinely waved through.
    TrainingSession.find({ ...sessionFilter, 'readiness.overrideReason': { $ne: null } })
      .populate('horse', 'name')
      .populate('readiness.overriddenBy', 'name')
      .select('horse scheduledAt objective readiness')
      .sort({ scheduledAt: -1 })
      .limit(20),
    // How often sessions actually hit the targets they were set.
    TrainingSession.aggregate([
      { $match: { ...sessionFilter, 'outcome.met': { $ne: null } } },
      { $group: { _id: '$outcome.met', count: { $sum: 1 } } },
    ]),
  ]);

  const careCoordination = await buildCareCoordination(range);
  const sessionsByStatus = Object.fromEntries(sessionStats.map((s) => [s._id, s.count]));
  const totalSessions = sessionStats.reduce((sum, s) => sum + s.count, 0);
  const countOf = (statuses) => statuses.reduce((n, st) => n + (sessionsByStatus[st] || 0), 0);

  const buildFinanceSummary = (type) => {
    const rows = financeAgg.filter((r) => r._id.type === type);
    return {
      total: rows.reduce((sum, r) => sum + r.total, 0),
      byCategory: rows.map((r) => ({ category: r._id.category, total: r.total })),
    };
  };

  const raceByStatus = Object.fromEntries(raceStats.map((r) => [r._id, r.count]));

  return ok(
    res,
    {
      period: { from: from || null, to: to || null },
      trainingPerformance: {
        totalSessions,
        sessionsByStatus,
        // Done work (completed + evaluated) and runs/bookings that did not end in it, apart.
        doneSessions: countOf(SESSION_DONE_STATUSES),
        notDone: Object.fromEntries(SESSION_NOT_DONE_STATUSES.map((st) => [st, sessionsByStatus[st] || 0])),
        avgPerformanceRating: ratingAgg[0] ? Math.round(ratingAgg[0].avgRating * 10) / 10 : null,
        ratedSessionCount: ratingAgg[0]?.ratedCount || 0,
        targetsMet: outcomeAgg.find((o) => o._id === true)?.count || 0,
        targetsMissed: outcomeAgg.find((o) => o._id === false)?.count || 0,
      },
      readinessOverrides: {
        count: overrideRows.length,
        recent: overrideRows.map((s) => ({
          _id: s._id,
          horse: s.horse?.name,
          scheduledAt: s.scheduledAt,
          objective: s.objective,
          reason: s.readiness?.overrideReason,
          by: s.readiness?.overriddenBy?.name,
          gates: (s.readiness?.gates || []).filter((g) => g.status === 'caution').map((g) => g.key),
        })),
      },
      careCoordination,
      operatingCost: buildFinanceSummary('cost'),
      raceRevenue: buildFinanceSummary('revenue'),
      raceParticipation: {
        totalEntries: raceStats.reduce((sum, r) => sum + r.count, 0),
        byStatus: raceByStatus,
      },
    },
    'Overview report generated.'
  );
});

/**
 * Training progress per month, for a chart: sessions completed, average rating, average top speed,
 * total distance and how many hit their targets — per horse and for all of them together. Scoped
 * like every horse list: an owner sees their horses, a trainer theirs, the manager all.
 * GET /reports/training-chart?months=6&horse=
 */
const getTrainingChart = asyncHandler(async (req, res) => {
  const months = Math.min(Math.max(parseInt(req.query.months, 10) || 6, 1), 24);
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  start.setMonth(start.getMonth() - (months - 1));

  const filter = { status: { $in: SESSION_DONE_STATUSES }, scheduledAt: { $gte: start } };
  const horse = await horseFilter(req.user, req.query.horse);
  if (horse !== undefined) filter.horse = horse;
  const sessions = await TrainingSession.find(filter).populate('horse', 'name').select('horse scheduledAt performanceRating metrics outcome');

  const monthKeys = Array.from({ length: months }, (_, i) => {
    const d = new Date(start);
    d.setMonth(start.getMonth() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const keyOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const blank = () => ({ sessions: 0, ratingSum: 0, rated: 0, speedSum: 0, speedCount: 0, totalDistance: 0, metTargets: 0 });
  const add = (b, s) => {
    b.sessions += 1;
    if (s.performanceRating) { b.ratingSum += s.performanceRating; b.rated += 1; }
    if (s.metrics?.maxSpeed) { b.speedSum += s.metrics.maxSpeed; b.speedCount += 1; }
    b.totalDistance += s.metrics?.distance || 0;
    if (s.outcome?.met === true) b.metTargets += 1;
  };
  const finish = (month, b) => ({
    month,
    sessions: b.sessions,
    avgRating: b.rated ? Number((b.ratingSum / b.rated).toFixed(1)) : null,
    avgMaxSpeed: b.speedCount ? Number((b.speedSum / b.speedCount).toFixed(1)) : null,
    totalDistance: Math.round(b.totalDistance),
    metTargets: b.metTargets,
  });

  const overall = new Map(monthKeys.map((k) => [k, blank()]));
  const perHorse = new Map();
  for (const s of sessions) {
    const key = keyOf(s.scheduledAt);
    if (!overall.has(key)) continue;
    add(overall.get(key), s);
    const id = String(s.horse?._id || s.horse);
    if (!perHorse.has(id)) perHorse.set(id, { horse: s.horse ? { _id: s.horse._id, name: s.horse.name } : { _id: id }, months: new Map(monthKeys.map((k) => [k, blank()])) });
    add(perHorse.get(id).months.get(key), s);
  }

  return ok(
    res,
    {
      months: monthKeys,
      totals: monthKeys.map((k) => finish(k, overall.get(k))),
      series: [...perHorse.values()].map((h) => ({ horse: h.horse, points: monthKeys.map((k) => finish(k, h.months.get(k))) })),
    },
    'Training chart computed.'
  );
});

/**
 * Club-wide money in and out per month or quarter, for the manager's cash-flow chart.
 * GET /reports/finance-chart?period=month|quarter&year=2026
 */
const getFinanceChart = asyncHandler(async (req, res) => {
  const { period, year, valid, from, to } = parsePeriodQuery(req.query);
  if (!valid) return fail(res, 'year không hợp lệ.', 400);
  const records = await FinancialRecord.find({ date: { $gte: from, $lt: to } }).select('type category amount date');
  const periods = emptyPeriods(period, year);
  const { totals, byCategory } = foldRecords(records, { period, periods });
  return ok(res, { year, period, totals, byCategory, periods }, 'Finance chart computed.');
});

module.exports = { getOverview, getTrainingChart, getFinanceChart };
