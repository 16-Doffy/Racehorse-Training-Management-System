const TrainingSession = require('../../models/TrainingSession');
const RaceEntry = require('../../models/RaceEntry');
const HealthRecord = require('../../models/HealthRecord');
const FinancialRecord = require('../../models/FinancialRecord');
const { clearanceMap } = require('../health/trainingClearance');
const { SESSION_OPEN_STATUSES, SESSION_DONE_STATUSES, SESSION_KINDS, OBJECTIVE_LABELS } = require('../../constants/training');

const firstBy = (rows, key = 'horse') => {
  const map = new Map();
  for (const r of rows) {
    const k = String(r[key]?._id || r[key]);
    if (!map.has(k)) map.set(k, r);
  }
  return map;
};
const kindOf = (s) => SESSION_KINDS[s.kind]?.label || OBJECTIVE_LABELS[s.objective] || 'Buổi tập';

/**
 * What an owner wants to know about each of their horses at a glance: how it is (health, the vet's
 * restriction), what comes next (the next session, the next race and the trainer's decision), how it
 * went last (session and race), and this year's money in and out (prize money apart, counted by
 * category so records from before `source` existed count too).
 */
async function ownerSummary(horses) {
  const ids = horses.map((h) => h._id);
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const [next, last, upcoming, raced, exams, money, clearances] = await Promise.all([
    TrainingSession.find({ horse: { $in: ids }, status: { $in: SESSION_OPEN_STATUSES }, scheduledAt: { $gte: new Date(now.getTime() - 3600000) } })
      .select('horse kind objective scheduledAt status')
      .sort({ scheduledAt: 1 }),
    TrainingSession.find({ horse: { $in: ids }, status: { $in: [...SESSION_DONE_STATUSES, 'aborted'] } })
      .select('horse kind objective scheduledAt actualEndAt status outcome performanceRating trainerComment videoUrl abortReason')
      .sort({ scheduledAt: -1 }),
    RaceEntry.find({ horse: { $in: ids }, status: { $in: ['registered', 'confirmed'] }, raceDate: { $gte: new Date(now.toDateString()) } })
      .select('horse raceName raceDate status decision reviewNeeded')
      .sort({ raceDate: 1 }),
    RaceEntry.find({ horse: { $in: ids }, status: 'completed' }).select('horse raceName raceDate result position prizeMoney').sort({ raceDate: -1 }),
    HealthRecord.find({ horse: { $in: ids } }).select('horse date createdAt resultStatus diagnosis').sort({ date: -1, createdAt: -1 }),
    FinancialRecord.find({ horse: { $in: ids }, date: { $gte: yearStart } }).select('horse type amount source category'),
    clearanceMap(ids),
  ]);
  const [nextBy, lastBy, upcomingBy, racedBy, examBy] = [next, last, upcoming, raced, exams].map((rows) => firstBy(rows));
  return horses.map((h) => {
    const key = String(h._id);
    const n = nextBy.get(key);
    const l = lastBy.get(key);
    const u = upcomingBy.get(key);
    const r = racedBy.get(key);
    const e = examBy.get(key);
    const c = clearances.get(key);
    const mine = money.filter((m) => String(m.horse) === key);
    const sum = (type, category) => mine.filter((m) => m.type === type && (!category || m.category === category)).reduce((t, m) => t + m.amount, 0);
    return {
      horse: { _id: h._id, name: h.name, healthStatus: h.healthStatus },
      health: { status: h.healthStatus, restricted: Boolean(c?.restricted), clearance: c?.label || 'tập bình thường', reason: c?.restricted ? c.reason || null : null, lastExam: e ? { date: e.date || e.createdAt, resultStatus: e.resultStatus, diagnosis: e.diagnosis } : null },
      next: n ? { kind: kindOf(n), at: n.scheduledAt, status: n.status } : null,
      last: l ? { kind: kindOf(l), at: l.actualEndAt || l.scheduledAt, status: l.status, met: l.outcome?.met ?? null, summary: l.status === 'aborted' ? `Dừng giữa chừng: ${l.abortReason || ''}` : l.outcome?.summary || '', rating: l.performanceRating ?? null, comment: l.trainerComment || null, videoUrl: l.videoUrl || null } : null,
      upcomingRace: u ? { name: u.raceName, date: u.raceDate, status: u.status, decided: Boolean(u.decision?.at), reviewNeeded: Boolean(u.reviewNeeded) } : null,
      lastRace: r ? { name: r.raceName, date: r.raceDate, result: r.result || null, position: r.position ?? null, prizeMoney: r.prizeMoney } : null,
      money: { year: now.getFullYear(), cost: sum('cost'), revenue: sum('revenue'), prize: sum('revenue', 'prize') },
    };
  });
}

module.exports = { ownerSummary };
