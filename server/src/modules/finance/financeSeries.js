/**
 * Cost / revenue totals over the months or quarters of one year — shared by the owner's statement
 * (GET /finance/mine/summary) and the manager's chart (GET /reports/finance-chart).
 */

const emptyTotals = () => ({ cost: 0, revenue: 0, net: 0 });

function addTo(bucket, record) {
  bucket[record.type] += record.amount;
  bucket.net = bucket.revenue - bucket.cost;
}

function parsePeriodQuery(query) {
  const period = query.period === 'quarter' ? 'quarter' : 'month';
  const year = parseInt(query.year, 10) || new Date().getFullYear();
  const valid = year >= 2000 && year <= 2100;
  return { period, year, valid, from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1) };
}

const slotOf = (period, date) => (period === 'quarter' ? Math.floor(new Date(date).getMonth() / 3) : new Date(date).getMonth());

/** Empty buckets for every month / quarter of the year; `extra` adds fields to each. */
function emptyPeriods(period, year, extra = () => ({})) {
  const slots = period === 'quarter' ? 4 : 12;
  return Array.from({ length: slots }, (_, i) => ({
    key: period === 'quarter' ? `${year}-Q${i + 1}` : `${year}-${String(i + 1).padStart(2, '0')}`,
    label: period === 'quarter' ? `Quý ${i + 1}/${year}` : `Tháng ${i + 1}/${year}`,
    ...emptyTotals(),
    medicalCost: 0,
    byCategory: {},
    ...extra(),
  }));
}

/**
 * Folds financial records into the period buckets, a running total and a by-category map.
 * `onRecord(record)` lets a caller add its own breakdown (e.g. per horse) in the same pass.
 */
function foldRecords(records, { period, periods, onRecord }) {
  const totals = { ...emptyTotals(), medicalCost: 0 };
  const byCategory = {};
  for (const record of records) {
    const slot = periods[slotOf(period, record.date)];
    const buckets = [slot, totals, ...(onRecord ? [onRecord(record)].filter(Boolean) : [])];
    buckets.forEach((b) => addTo(b, record));
    for (const map of [slot.byCategory, byCategory]) {
      map[record.category] = map[record.category] || emptyTotals();
      addTo(map[record.category], record);
    }
    if (record.type === 'cost' && record.category === 'medical') {
      buckets.forEach((b) => {
        b.medicalCost = (b.medicalCost || 0) + record.amount;
      });
    }
  }
  return { totals, byCategory };
}

module.exports = { emptyTotals, parsePeriodQuery, slotOf, emptyPeriods, foldRecords };
