const TrainingSession = require('../../models/TrainingSession');
const FinancialRecord = require('../../models/FinancialRecord');
const RaceEntry = require('../../models/RaceEntry');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');

/** Builds a { $gte, $lte } range filter from optional `from`/`to` query params, or {} if neither given. */
function dateRangeFilter(from, to) {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return Object.keys(range).length ? range : null;
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

  const [sessionStats, ratingAgg, financeAgg, raceStats] = await Promise.all([
    TrainingSession.aggregate([
      { $match: sessionFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
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
  ]);

  const sessionsByStatus = Object.fromEntries(sessionStats.map((s) => [s._id, s.count]));
  const totalSessions = sessionStats.reduce((sum, s) => sum + s.count, 0);

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
        avgPerformanceRating: ratingAgg[0] ? Math.round(ratingAgg[0].avgRating * 10) / 10 : null,
        ratedSessionCount: ratingAgg[0]?.ratedCount || 0,
      },
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

module.exports = { getOverview };
