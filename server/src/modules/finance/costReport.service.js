const Horse = require('../../models/Horse');
const FeedingCalendarDay = require('../../models/FeedingCalendarDay');
const FeedingSchedule = require('../../models/FeedingSchedule');
const InventoryItem = require('../../models/InventoryItem');
const Treatment = require('../../models/Treatment');
const HealthRecord = require('../../models/HealthRecord');
const StableAssignment = require('../../models/StableAssignment');
const CareEvent = require('../../models/CareEvent');
const clubPolicy = require('../../config/clubPolicy');

/**
 * What each horse costs the club, worked out from what the system already records — figures to read
 * (the Manager's and the owner's), not bills: the money itself is settled outside the system.
 *
 * - Thức ăn (feed): every day of its feeding calendar (the confirmed days of its plans, those ahead too,
 *   marked as planned) and, on days without one, its standing rations — each item's amount at its stock
 *   price (InventoryItem.price is per purchase unit: a pack of packSize units when packUnit is set).
 * - Y tế (medical): each prescribed medicine, its amount a dose × doses a day × the days it is given, at
 *   its stock price; and each vet exam at the club's exam fee.
 * - Nuôi dưỡng (upkeep): the days in its stall at the club's day rate for the stall's kind (standard,
 *   recovery, isolation; the stall it is in now), the groom's care on those days, and the routine care
 *   visits (farrier, vaccination, deworming) at the club's rates (clubPolicy.costRates).
 *
 * Month by month for a year; an amount with no price in stock counts at 0 and is named in missingPrices.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const midnight = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const round = (n) => Math.round(n);
const idOf = (ref) => String(ref?._id || ref || '');

/** The price of one unit an item is used in (kg, ml, viên…), or null without a price. */
function unitPriceOf(item) {
  if (!item || typeof item.price !== 'number' || item.price < 0) return null;
  const per = item.packUnit && item.packSize > 0 ? item.packSize : 1;
  return item.price / per;
}

/** Doses a day of a medicine: its clock times, else its parts of the day, else "2 lần/ngày" in its frequency, else one. */
function dosesPerDay(med) {
  if (med.times?.length) return med.times.length;
  if (med.timeSlots?.length) return med.timeSlots.length;
  const typed = String(med.specificTimes || '').split(/[,;\s]+/).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).length;
  if (typed) return typed;
  const m = String(med.frequency || '').match(/(\d+)\s*(lần|l\b|x|times)/i);
  return m ? Math.max(1, Number(m[1])) : 1;
}

/** Every day from `from` to `to` (Dates, inclusive), as midnight Dates. */
function* days(from, to) {
  for (let t = midnight(from).getTime(); t <= midnight(to).getTime(); t += DAY_MS) yield new Date(t);
}

const emptyMonth = (month) => ({ month, feed: 0, medical: 0, upkeep: 0, feedAhead: 0, medicalAhead: 0, total: 0 });
const LINE = (label, unit) => ({ label, unit, quantity: 0, unitPrice: null, cost: 0, ahead: 0 });

/**
 * The cost report for `horseIds` (null: every horse not archived) over `year`.
 * Returns { year, today, rates, horses: [{ horse, feed, medical, upkeep, total, ahead, months, details, missingPrices }],
 * totals: { feed, medical, upkeep, total, ahead, months } }.
 */
async function costReport({ horseIds = null, year = new Date().getFullYear(), now = new Date() } = {}) {
  const rates = clubPolicy.costRates;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const today = midnight(now);
  const lastPast = today < yearEnd ? today : yearEnd;
  const monthKeys = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);

  const horses = await Horse.find(horseIds ? { _id: { $in: horseIds } } : { isArchived: { $ne: true } })
    .select('name createdAt isArchived')
    .sort({ name: 1 })
    .lean();
  const ids = horses.map((h) => h._id);
  const [calendarDays, rations, treatments, exams, assignments, visits] = await Promise.all([
    FeedingCalendarDay.find({ horse: { $in: ids }, date: { $gte: dayKey(yearStart), $lte: dayKey(yearEnd) } }).select('horse date meals').lean(),
    FeedingSchedule.find({ horse: { $in: ids } }).select('horse items createdAt').lean(),
    Treatment.find({ horse: { $in: ids }, startDate: { $lte: new Date(year, 11, 31, 23, 59, 59) } }).select('horse medications startDate endDate status updatedAt').lean(),
    HealthRecord.find({ horse: { $in: ids }, date: { $gte: yearStart, $lte: new Date(year, 11, 31, 23, 59, 59) } }).select('horse date diagnosis').lean(),
    StableAssignment.find({ horse: { $in: ids } }).populate('stall', 'type code').select('horse stall stableBlock assignedCaretaker createdAt').lean(),
    CareEvent.find({ horse: { $in: ids }, date: { $gte: yearStart, $lte: new Date(year, 11, 31, 23, 59, 59) } }).select('horse kind date').lean(),
  ]);

  // Every stock item named anywhere, with its price.
  const itemIds = new Set();
  calendarDays.forEach((d) => d.meals?.forEach((m) => m.items?.forEach((i) => i.inventoryItem && itemIds.add(idOf(i.inventoryItem)))));
  rations.forEach((r) => r.items?.forEach((i) => i.inventoryItem && itemIds.add(idOf(i.inventoryItem))));
  treatments.forEach((t) => t.medications?.forEach((m) => m.inventoryItem && itemIds.add(idOf(m.inventoryItem))));
  const items = new Map((await InventoryItem.find({ _id: { $in: [...itemIds] } }).select('name unit price packUnit packSize').lean()).map((i) => [String(i._id), i]));

  const byHorse = (list) => {
    const map = new Map();
    for (const x of list) {
      const k = idOf(x.horse);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(x);
    }
    return map;
  };
  const calendarOf = byHorse(calendarDays);
  const rationsOf = byHorse(rations);
  const treatmentsOf = byHorse(treatments);
  const examsOf = byHorse(exams);
  const visitsOf = byHorse(visits);
  const assignmentOf = new Map(assignments.map((a) => [idOf(a.horse), a]));

  const report = horses.map((horse) => {
    const id = String(horse._id);
    const months = new Map(monthKeys.map((k) => [k, emptyMonth(k)]));
    const missing = new Set();
    const feedLines = new Map();
    const medLines = new Map();
    const upkeepLines = [];
    const add = (date, field, amount) => {
      const month = months.get(dayKey(date).slice(0, 7));
      if (!month || !amount) return;
      month[field] += amount;
      if (date > today && (field === 'feed' || field === 'medical')) month[`${field}Ahead`] += amount;
    };
    /** One stock item eaten or given: its line (quantity and cost), and the month. */
    const consume = (lines, field, ref, name, unit, amount, date) => {
      const stock = ref ? items.get(idOf(ref)) : null;
      const price = unitPriceOf(stock);
      const key = stock ? String(stock._id) : `name:${name}`;
      if (!lines.has(key)) lines.set(key, { ...LINE(stock?.name || name || 'Không rõ', stock?.unit || unit || ''), unitPrice: price });
      const line = lines.get(key);
      line.quantity += amount;
      if (price == null) {
        missing.add(line.label);
        return;
      }
      const cost = amount * price;
      line.cost += cost;
      if (date > today) line.ahead += cost;
      add(date, field, cost);
    };

    // Feed: the calendar's days, else the standing rations up to today.
    const calendarDates = new Set();
    for (const day of calendarOf.get(id) || []) {
      calendarDates.add(day.date);
      const date = new Date(`${day.date}T00:00:00`);
      for (const meal of day.meals || []) for (const i of meal.items || []) consume(feedLines, 'feed', i.inventoryItem, i.name, i.unit, Number(i.amount) || 0, date);
    }
    const standing = rationsOf.get(id) || [];
    if (standing.length) {
      const since = new Date(Math.max(yearStart, ...standing.map((r) => midnight(r.createdAt || yearStart).getTime())));
      for (const date of days(since, lastPast)) {
        if (calendarDates.has(dayKey(date))) continue;
        for (const r of standing) for (const i of r.items || []) consume(feedLines, 'feed', i.inventoryItem, i.type, i.unit, Number(i.amount) || 0, date);
      }
    }

    // Medical: the medicines as prescribed, and the exams.
    for (const t of treatmentsOf.get(id) || []) {
      for (const m of t.medications || []) {
        if (!(Number(m.amount) > 0)) continue;
        const from = new Date(Math.max(yearStart, midnight(m.startDate || t.startDate || yearStart).getTime()));
        const endAt = m.endDate || t.endDate || (t.status === 'ongoing' && m.status !== 'completed' && m.status !== 'cancelled' ? today : t.updatedAt || today);
        const to = new Date(Math.min(yearEnd, midnight(endAt).getTime()));
        const perDay = Number(m.amount) * dosesPerDay(m);
        for (const date of days(from, to)) consume(medLines, 'medical', m.inventoryItem, m.name, null, perDay, date);
      }
    }
    const examList = examsOf.get(id) || [];
    if (examList.length) {
      medLines.set('exam', { ...LINE('Phí khám của bác sĩ', 'lần'), unitPrice: rates.exam, quantity: examList.length, cost: examList.length * rates.exam });
      for (const e of examList) add(midnight(e.date), 'medical', rates.exam);
    }

    // Upkeep: stall days and the groom's care, up to today; the routine care visits.
    const assignment = assignmentOf.get(id);
    if (assignment) {
      const kind = assignment.stall?.type || 'standard';
      const since = new Date(Math.max(yearStart, midnight(assignment.createdAt || horse.createdAt || yearStart).getTime()));
      const list = [...days(since, lastPast)];
      if (list.length) {
        const stallRate = rates.stallDay[kind] ?? rates.stallDay.standard;
        const kindLabel = { standard: 'chuồng thường', recovery: 'chuồng hồi phục', isolation: 'chuồng cách ly' }[kind] || 'chuồng';
        upkeepLines.push({ ...LINE(`Tiền ${kindLabel}${assignment.stall?.code ? ` ${assignment.stall.code}` : ''}`, 'ngày'), quantity: list.length, unitPrice: stallRate, cost: list.length * stallRate });
        list.forEach((d) => add(d, 'upkeep', stallRate));
        if (assignment.assignedCaretaker) {
          upkeepLines.push({ ...LINE('Công chăm sóc hằng ngày', 'ngày'), quantity: list.length, unitPrice: rates.groomDay, cost: list.length * rates.groomDay });
          list.forEach((d) => add(d, 'upkeep', rates.groomDay));
        }
      }
    }
    const VISIT_LABELS = { farrier: 'Đóng / chăm sóc móng', vaccination: 'Tiêm phòng', deworming: 'Tẩy giun' };
    for (const kind of Object.keys(VISIT_LABELS)) {
      const list = (visitsOf.get(id) || []).filter((v) => v.kind === kind);
      if (!list.length) continue;
      const rate = rates.visit[kind];
      upkeepLines.push({ ...LINE(VISIT_LABELS[kind], 'lần'), quantity: list.length, unitPrice: rate, cost: list.length * rate });
      list.forEach((v) => add(midnight(v.date), 'upkeep', rate));
    }

    const monthList = [...months.values()].map((m) => ({
      ...m,
      feed: round(m.feed),
      medical: round(m.medical),
      upkeep: round(m.upkeep),
      feedAhead: round(m.feedAhead),
      medicalAhead: round(m.medicalAhead),
      total: round(m.feed + m.medical + m.upkeep),
    }));
    const sum = (field) => monthList.reduce((n, m) => n + m[field], 0);
    const lines = (map) =>
      [...map.values()]
        .map((l) => ({ ...l, quantity: Math.round(l.quantity * 100) / 100, cost: round(l.cost), ahead: round(l.ahead), unitPrice: l.unitPrice == null ? null : round(l.unitPrice) }))
        .sort((a, b) => b.cost - a.cost);
    return {
      horse: { _id: horse._id, name: horse.name, isArchived: Boolean(horse.isArchived) },
      feed: sum('feed'),
      medical: sum('medical'),
      upkeep: sum('upkeep'),
      ahead: sum('feedAhead') + sum('medicalAhead'),
      total: sum('total'),
      months: monthList,
      details: { feed: lines(feedLines), medical: lines(medLines), upkeep: upkeepLines.map((l) => ({ ...l, cost: round(l.cost) })) },
      missingPrices: [...missing],
    };
  });

  const totals = {
    feed: report.reduce((n, h) => n + h.feed, 0),
    medical: report.reduce((n, h) => n + h.medical, 0),
    upkeep: report.reduce((n, h) => n + h.upkeep, 0),
    ahead: report.reduce((n, h) => n + h.ahead, 0),
    total: report.reduce((n, h) => n + h.total, 0),
    months: monthKeys.map((k, i) => {
      const m = emptyMonth(k);
      for (const h of report) for (const f of ['feed', 'medical', 'upkeep', 'feedAhead', 'medicalAhead', 'total']) m[f] += h.months[i][f];
      return m;
    }),
  };
  return { year, today: dayKey(today), rates, horses: report, totals };
}

module.exports = { costReport, unitPriceOf, dosesPerDay };
