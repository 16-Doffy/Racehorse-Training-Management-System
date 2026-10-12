const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, fail } = require('../../utils/apiResponse');
const crudFactory = require('../../utils/crudFactory');
const FinancialRecord = require('../../models/FinancialRecord');
const Horse = require('../../models/Horse');
const HealthRecord = require('../../models/HealthRecord');
const Treatment = require('../../models/Treatment');
const RaceEntry = require('../../models/RaceEntry');

/** Records from before `source` existed: a prize that a race result wrote is race_prize, the rest manual. */
async function withSource(records) {
  const legacy = records.filter((r) => !r.source || (r.source === 'manual' && r.category === 'prize'));
  if (!legacy.length) return records;
  const linked = new Set((await RaceEntry.find({ financeRecord: { $in: legacy.map((r) => r._id) } }).select('financeRecord')).map((e) => String(e.financeRecord)));
  return records.map((r) => {
    const obj = r.toObject ? r.toObject() : r;
    if (linked.has(String(obj._id))) obj.source = 'race_prize';
    else if (!obj.source) obj.source = 'manual';
    return obj;
  });
}

// A record a race result wrote is corrected through that result (PATCH /races/:id/results), so the
// prize can't be doubled or drift from the race; manual records are the Manager's to edit. Once the
// race entry itself is gone nothing would correct it any more, so the Manager can then tidy it up.
const refuseSystemRecord = asyncHandler(async (req, res, next) => {
  const record = await FinancialRecord.findById(req.params.id).select('_id');
  if (!record) return fail(res, 'Financial record not found.', 404);
  if (await RaceEntry.exists({ financeRecord: record._id })) {
    return fail(res, 'Khoản này do hệ thống ghi từ kết quả giải — sửa ở "Cập nhật kết quả" của giải đó.', 409);
  }
  return next();
});

// Scaffold module: Manager records cost/revenue entries; Owner views a read-only summary for
// their own horses. Aggregated reporting (charts, periodic statements) comes in a later phase.
const ctrl = crudFactory(FinancialRecord, {
  populate: [{ path: 'horse', select: 'name owner' }, { path: 'recordedBy', select: 'name' }],
  defaultSort: { date: -1 },
  label: 'Financial record',
  // Recorded by whoever is logged in, not whoever the request body names.
  stamp: (req, { isCreate }) => (isCreate ? { recordedBy: req.user._id, source: 'manual' } : {}),
  fields: ['horse', 'type', 'category', 'amount', 'date', 'note'],
});

const listMine = asyncHandler(async (req, res) => {
  const myHorses = await Horse.find({ owner: req.user._id }).select('_id');
  const records = await FinancialRecord.find({ horse: { $in: myHorses.map((h) => h._id) } })
    .populate('horse', 'name')
    .sort({ date: -1 });
  return ok(res, await withSource(records), 'Your financial records fetched.');
});

const { emptyTotals, parsePeriodQuery, slotOf, emptyPeriods, foldRecords } = require('./financeSeries');

/**
 * The owner's periodic statement: what each of their horses cost and earned, per month or per
 * quarter of one year, with the medical side called out — spending in the "medical" category next
 * to how many exams and treatments the horse actually had. /finance/mine is the raw ledger; this
 * is the report an owner reads.
 *
 * GET /finance/mine/summary?period=month|quarter&year=2026
 */
const summarizeMine = asyncHandler(async (req, res) => {
  const { period, year, valid, from, to } = parsePeriodQuery(req.query);
  if (!valid) return fail(res, 'year không hợp lệ.', 400);
  const horses = await Horse.find({ owner: req.user._id }).select('name');
  const horseIds = horses.map((h) => h._id);
  const inYear = { $gte: from, $lt: to };

  const [records, exams, treatments] = await Promise.all([
    FinancialRecord.find({ horse: { $in: horseIds }, date: inYear }).select('horse type category amount date'),
    HealthRecord.find({ horse: { $in: horseIds }, date: inYear }).select('horse date'),
    Treatment.find({ horse: { $in: horseIds }, createdAt: inYear }).select('horse createdAt'),
  ]);

  const periods = emptyPeriods(period, year, () => ({ exams: 0, treatments: 0 }));

  const byHorse = new Map(
    horses.map((h) => [String(h._id), { horse: { _id: h._id, name: h.name }, ...emptyTotals(), medicalCost: 0, exams: 0, treatments: 0 }])
  );
  const { totals, byCategory } = foldRecords(records, { period, periods, onRecord: (r) => byHorse.get(String(r.horse)) });
  Object.assign(totals, { exams: exams.length, treatments: treatments.length });
  for (const exam of exams) {
    periods[slotOf(period, exam.date)].exams += 1;
    byHorse.get(String(exam.horse)).exams += 1;
  }
  for (const treatment of treatments) {
    periods[slotOf(period, treatment.createdAt)].treatments += 1;
    byHorse.get(String(treatment.horse)).treatments += 1;
  }

  return ok(res, { year, period, totals, byCategory, periods, byHorse: [...byHorse.values()] }, 'Financial summary computed.');
});

router.use(protect);
router.get('/mine/summary', authorize(ROLES.OWNER), summarizeMine);
router.get('/mine', authorize(ROLES.OWNER), listMine);
router.get(
  '/',
  authorize(ROLES.MANAGER),
  asyncHandler(async (req, res) => {
    const filter = req.query.horse ? { horse: req.query.horse } : {};
    const records = await FinancialRecord.find(filter).populate([{ path: 'horse', select: 'name owner' }, { path: 'recordedBy', select: 'name' }]).sort({ date: -1 });
    return ok(res, await withSource(records), 'Financial records fetched.');
  })
);
router.get('/:id', authorize(ROLES.MANAGER), ctrl.getOne);
router.post('/', authorize(ROLES.MANAGER), ctrl.createOne);
router.put('/:id', authorize(ROLES.MANAGER), refuseSystemRecord, ctrl.updateOne);
router.delete('/:id', authorize(ROLES.MANAGER), refuseSystemRecord, ctrl.removeOne);

module.exports = router;
