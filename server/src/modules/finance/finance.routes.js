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

// Scaffold module: Manager records cost/revenue entries; Owner views a read-only summary for
// their own horses. Aggregated reporting (charts, periodic statements) comes in a later phase.
const ctrl = crudFactory(FinancialRecord, {
  populate: [{ path: 'horse', select: 'name owner' }, { path: 'recordedBy', select: 'name' }],
  defaultSort: { date: -1 },
  label: 'Financial record',
  // Recorded by whoever is logged in, not whoever the request body names.
  stamp: (req, { isCreate }) => (isCreate ? { recordedBy: req.user._id } : {}),
});

const listMine = asyncHandler(async (req, res) => {
  const myHorses = await Horse.find({ owner: req.user._id }).select('_id');
  const records = await FinancialRecord.find({ horse: { $in: myHorses.map((h) => h._id) } })
    .populate('horse', 'name')
    .sort({ date: -1 });
  return ok(res, records, 'Your financial records fetched.');
});

const emptyTotals = () => ({ cost: 0, revenue: 0, net: 0 });

function addTo(bucket, record) {
  bucket[record.type] += record.amount;
  bucket.net = bucket.revenue - bucket.cost;
}

/**
 * The owner's periodic statement: what each of their horses cost and earned, per month or per
 * quarter of one year, with the medical side called out — spending in the "medical" category next
 * to how many exams and treatments the horse actually had. /finance/mine is the raw ledger; this
 * is the report an owner reads.
 *
 * GET /finance/mine/summary?period=month|quarter&year=2026
 */
const summarizeMine = asyncHandler(async (req, res) => {
  const period = req.query.period === 'quarter' ? 'quarter' : 'month';
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  if (year < 2000 || year > 2100) return fail(res, 'year không hợp lệ.', 400);

  const from = new Date(year, 0, 1);
  const to = new Date(year + 1, 0, 1);
  const horses = await Horse.find({ owner: req.user._id }).select('name');
  const horseIds = horses.map((h) => h._id);
  const inYear = { $gte: from, $lt: to };

  const [records, exams, treatments] = await Promise.all([
    FinancialRecord.find({ horse: { $in: horseIds }, date: inYear }).select('horse type category amount date'),
    HealthRecord.find({ horse: { $in: horseIds }, date: inYear }).select('horse date'),
    Treatment.find({ horse: { $in: horseIds }, createdAt: inYear }).select('horse createdAt'),
  ]);

  const slots = period === 'quarter' ? 4 : 12;
  const slotOf = (date) => (period === 'quarter' ? Math.floor(new Date(date).getMonth() / 3) : new Date(date).getMonth());
  const periods = Array.from({ length: slots }, (_, i) => ({
    key: period === 'quarter' ? `${year}-Q${i + 1}` : `${year}-${String(i + 1).padStart(2, '0')}`,
    label: period === 'quarter' ? `Quý ${i + 1}/${year}` : `Tháng ${i + 1}/${year}`,
    ...emptyTotals(),
    medicalCost: 0,
    exams: 0,
    treatments: 0,
    byCategory: {},
  }));

  const byHorse = new Map(
    horses.map((h) => [String(h._id), { horse: { _id: h._id, name: h.name }, ...emptyTotals(), medicalCost: 0, exams: 0, treatments: 0 }])
  );
  const totals = { ...emptyTotals(), medicalCost: 0, exams: exams.length, treatments: treatments.length };
  const byCategory = {};

  for (const record of records) {
    const slot = periods[slotOf(record.date)];
    const horse = byHorse.get(String(record.horse));
    [slot, horse, totals].forEach((bucket) => addTo(bucket, record));

    for (const map of [slot.byCategory, byCategory]) {
      map[record.category] = map[record.category] || emptyTotals();
      addTo(map[record.category], record);
    }
    if (record.type === 'cost' && record.category === 'medical') {
      [slot, horse, totals].forEach((bucket) => {
        bucket.medicalCost += record.amount;
      });
    }
  }
  for (const exam of exams) {
    periods[slotOf(exam.date)].exams += 1;
    byHorse.get(String(exam.horse)).exams += 1;
  }
  for (const treatment of treatments) {
    periods[slotOf(treatment.createdAt)].treatments += 1;
    byHorse.get(String(treatment.horse)).treatments += 1;
  }

  return ok(res, { year, period, totals, byCategory, periods, byHorse: [...byHorse.values()] }, 'Financial summary computed.');
});

router.use(protect);
router.get('/mine/summary', authorize(ROLES.OWNER), summarizeMine);
router.get('/mine', authorize(ROLES.OWNER), listMine);
router.get('/', authorize(ROLES.MANAGER), ctrl.list);
router.get('/:id', authorize(ROLES.MANAGER), ctrl.getOne);
router.post('/', authorize(ROLES.MANAGER), ctrl.createOne);
router.put('/:id', authorize(ROLES.MANAGER), ctrl.updateOne);
router.delete('/:id', authorize(ROLES.MANAGER), ctrl.removeOne);

module.exports = router;
