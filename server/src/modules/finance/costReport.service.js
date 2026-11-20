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
// A line of a horse's costs. `key` is the same for the same thing on every horse (an item, a kind of stall,
// the groom's care, a kind of visit), so lines add up across horses; `note` says which (the stall's code).
const LINE = (key, label, unit) => ({ key, label, unit, quantity: 0, unitPrice: null, cost: 0, ahead: 0 });
const STALL_KINDS = { standard: 'chuồng thường', recovery: 'chuồng hồi phục', isolation: 'chuồng cách ly' };
const VISIT_LABELS = { farrier: 'Đóng / chăm sóc móng', vaccination: 'Tiêm phòng', deworming: 'Tẩy giun' };

/** Every feed and medicine item in stock with its price: what a pack costs and what one unit comes to. */
async function stockPrices() {
  const list = await InventoryItem.find({ category: { $in: ['feed', 'medicine'] } })
    .select('name code category unit price packUnit packSize')
    .sort({ category: 1, name: 1 })
    .lean();
  return list.map((i) => {
    const unitPrice = unitPriceOf(i);
    return {
      _id: i._id,
      name: i.name,
      code: i.code || null,
      category: i.category,
      unit: i.unit,
      price: typeof i.price === 'number' ? i.price : null,
      packUnit: i.packUnit || null,
      packSize: i.packUnit && i.packSize > 0 ? i.packSize : null,
      unitPrice: unitPrice == null ? null : Math.round(unitPrice * 100) / 100,
    };
  });
}

/**
 * The cost report for `horseIds` (null: every horse not archived) over `year`.
 * Returns { year, today, rates, prices, horses: [{ horse, feed, medical, upkeep, total, ahead, months, details, missingPrices }],
 * totals } — each month with its lines of each kind (months[i].lines.feed…), details the year's lines;
 * a line: { key, label, note, unit, quantity, unitPrice, cost, ahead, aheadQuantity }. Totals:
 * { feed, medical, upkeep, total, ahead, months }.
 */
async function costReport({ horseIds = null, year = new Date().getFullYear(), now = new Date() } = {}) {
  const rates = clubPolicy.costRates;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const today = midnight(now);
  const lastPast = today < yearEnd ? today : yearEnd;
  const monthKeys = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);

  // Only the horses the club still keeps: one sold, retired or dead (archived) is no longer reported.
  const horses = await Horse.find({ ...(horseIds ? { _id: { $in: horseIds } } : {}), isArchived: { $ne: true } })
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
    // Each month's lines of each kind, keyed alike on every horse; the year's lines add them up.
    const monthLines = new Map(monthKeys.map((k) => [k, { feed: new Map(), medical: new Map(), upkeep: new Map() }]));
    /**
     * `quantity` of a thing (`line`: key, label, unit, unitPrice — null when it has no price, counting 0) on
     * `date`: into its month's line and its month's total. Feed and medicine after today are planned (ahead).
     */
    const put = (date, field, line, quantity) => {
      const key = dayKey(date).slice(0, 7);
      const month = months.get(key);
      if (!month || !quantity) return;
      const lines = monthLines.get(key)[field];
      if (!lines.has(line.key)) lines.set(line.key, { ...LINE(line.key, line.label, line.unit), unitPrice: line.unitPrice, note: line.note || null, aheadQuantity: 0 });
      const l = lines.get(line.key);
      const cost = line.unitPrice == null ? 0 : quantity * line.unitPrice;
      const ahead = date > today && field !== 'upkeep';
      l.quantity += quantity;
      l.cost += cost;
      month[field] += cost;
      if (ahead) {
        l.aheadQuantity += quantity;
        l.ahead += cost;
        month[`${field}Ahead`] += cost;
      }
    };
    /** One stock item eaten or given, at its stock price per unit (none: named in missingPrices). */
    const consume = (field, ref, name, unit, amount, date) => {
      const stock = ref ? items.get(idOf(ref)) : null;
      const price = unitPriceOf(stock);
      const label = stock?.name || name || 'Không rõ';
      if (price == null) missing.add(label);
      put(date, field, { key: stock ? String(stock._id) : `name:${name}`, label, unit: stock?.unit || unit || '', unitPrice: price }, amount);
    };

    // Feed: the calendar's days, else the standing rations up to today.
    const calendarDates = new Set();
    for (const day of calendarOf.get(id) || []) {
      calendarDates.add(day.date);
      const date = new Date(`${day.date}T00:00:00`);
      for (const meal of day.meals || []) for (const i of meal.items || []) consume('feed', i.inventoryItem, i.name, i.unit, Number(i.amount) || 0, date);
    }
    const standing = rationsOf.get(id) || [];
    if (standing.length) {
      const since = new Date(Math.max(yearStart, ...standing.map((r) => midnight(r.createdAt || yearStart).getTime())));
      for (const date of days(since, lastPast)) {
        if (calendarDates.has(dayKey(date))) continue;
        for (const r of standing) for (const i of r.items || []) consume('feed', i.inventoryItem, i.type, i.unit, Number(i.amount) || 0, date);
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
        for (const date of days(from, to)) consume('medical', m.inventoryItem, m.name, null, perDay, date);
      }
    }
    const exam = { key: 'exam', label: 'Phí khám của bác sĩ', unit: 'lần', unitPrice: rates.exam };
    for (const e of examsOf.get(id) || []) put(midnight(e.date), 'medical', exam, 1);

    // Upkeep: stall days and the groom's care, up to today; the routine care visits.
    const assignment = assignmentOf.get(id);
    if (assignment) {
      const kind = STALL_KINDS[assignment.stall?.type] ? assignment.stall.type : 'standard';
      const since = new Date(Math.max(yearStart, midnight(assignment.createdAt || horse.createdAt || yearStart).getTime()));
      const stall = {
        key: `stall:${kind}`,
        label: `Tiền ${STALL_KINDS[kind]}`,
        note: assignment.stall?.code ? `Chuồng ${assignment.stall.code}` : null,
        unit: 'ngày',
        unitPrice: rates.stallDay[kind] ?? rates.stallDay.standard,
      };
      const groom = { key: 'groom', label: 'Công chăm sóc hằng ngày', unit: 'ngày', unitPrice: rates.groomDay };
      for (const date of days(since, lastPast)) {
        put(date, 'upkeep', stall, 1);
        if (assignment.assignedCaretaker) put(date, 'upkeep', groom, 1);
      }
    }
    for (const v of visitsOf.get(id) || []) {
      if (!VISIT_LABELS[v.kind]) continue;
      put(midnight(v.date), 'upkeep', { key: `visit:${v.kind}`, label: VISIT_LABELS[v.kind], unit: 'lần', unitPrice: rates.visit[v.kind] }, 1);
    }

    const round2 = (n) => Math.round(n * 100) / 100;
    const tidy = (list) =>
      list
        .map((l) => ({ ...l, quantity: round2(l.quantity), aheadQuantity: round2(l.aheadQuantity), cost: round(l.cost), ahead: round(l.ahead), unitPrice: l.unitPrice == null ? null : round(l.unitPrice) }))
        .sort((a, b) => b.cost - a.cost);
    /** The year's lines of a kind: each month's added up. */
    const yearLines = (field) => {
      const map = new Map();
      for (const ml of monthLines.values()) {
        for (const l of ml[field].values()) {
          if (!map.has(l.key)) map.set(l.key, { ...l, quantity: 0, aheadQuantity: 0, cost: 0, ahead: 0 });
          const y = map.get(l.key);
          y.quantity += l.quantity;
          y.aheadQuantity += l.aheadQuantity;
          y.cost += l.cost;
          y.ahead += l.ahead;
        }
      }
      return tidy([...map.values()]);
    };

    const monthList = [...months.values()].map((m) => {
      const ml = monthLines.get(m.month);
      return {
        ...m,
        feed: round(m.feed),
        medical: round(m.medical),
        upkeep: round(m.upkeep),
        feedAhead: round(m.feedAhead),
        medicalAhead: round(m.medicalAhead),
        total: round(m.feed + m.medical + m.upkeep),
        // What the month's amounts are made of, line by line (the ledger opens a month's line on these).
        lines: { feed: tidy([...ml.feed.values()]), medical: tidy([...ml.medical.values()]), upkeep: tidy([...ml.upkeep.values()]) },
      };
    });
    const sum = (field) => monthList.reduce((n, m) => n + m[field], 0);
    return {
      horse: { _id: horse._id, name: horse.name, isArchived: Boolean(horse.isArchived) },
      feed: sum('feed'),
      medical: sum('medical'),
      upkeep: sum('upkeep'),
      ahead: sum('feedAhead') + sum('medicalAhead'),
      total: sum('total'),
      months: monthList,
      details: { feed: yearLines('feed'), medical: yearLines('medical'), upkeep: yearLines('upkeep') },
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
  // The prices it all was worked out at, for the Manager and the owners to read: the club's rates and the stock's.
  return { year, today: dayKey(today), rates, prices: await stockPrices(), horses: report, totals };
}

module.exports = { costReport, unitPriceOf, dosesPerDay, stockPrices };
