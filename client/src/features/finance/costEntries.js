import dayjs from 'dayjs';

// What each kind of cost counted, said on its ledger line.
const NOTES = {
  feed: 'Hệ thống tính: lịch khẩu phần × đơn giá kho',
  medical: 'Hệ thống tính: thuốc theo đơn × đơn giá kho, phí khám',
  upkeep: 'Hệ thống tính: tiền chuồng, công chăm sóc, móng / tiêm phòng / tẩy giun',
};

/**
 * The cost report (GET /finance/costs) as ledger entries, so the ledger, its totals and the report add up
 * to the same: one line a month for each horse and each kind of cost, what was spent up to today (what is
 * only planned ahead stays in the report). Horses no longer kept (archived) are left out. Source 'system'.
 */
export function costEntries(report) {
  if (!report?.horses) return [];
  const today = dayjs().startOf('day');
  const out = [];
  for (const h of report.horses) {
    if (h.horse?.isArchived) continue;
    for (const m of h.months || []) {
      const month = dayjs(`${m.month}-01`);
      if (month.isAfter(today)) continue;
      const date = month.endOf('month').isAfter(today) ? today : month.endOf('month').startOf('day');
      const spent = { feed: m.feed - (m.feedAhead || 0), medical: m.medical - (m.medicalAhead || 0), upkeep: m.upkeep };
      for (const [category, amount] of Object.entries(spent)) {
        if (!(amount > 0)) continue;
        out.push({
          _id: `cost-${h.horse._id}-${m.month}-${category}`,
          type: 'cost',
          category,
          amount: Math.round(amount),
          date: date.toISOString(),
          note: `${NOTES[category]} · tháng ${month.month() + 1}/${month.year()}`,
          horse: { _id: h.horse._id, name: h.horse.name },
          source: 'system',
        });
      }
    }
  }
  return out;
}
