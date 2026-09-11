const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const crudFactory = require('../../utils/crudFactory');
const FinancialRecord = require('../../models/FinancialRecord');
const Horse = require('../../models/Horse');

// Scaffold module: Manager records cost/revenue entries; Owner views a read-only summary for
// their own horses. Aggregated reporting (charts, periodic statements) comes in a later phase.
const ctrl = crudFactory(FinancialRecord, {
  populate: [{ path: 'horse', select: 'name owner' }, { path: 'recordedBy', select: 'name' }],
  defaultSort: { date: -1 },
  label: 'Financial record',
});

const listMine = asyncHandler(async (req, res) => {
  const myHorses = await Horse.find({ owner: req.user._id }).select('_id');
  const records = await FinancialRecord.find({ horse: { $in: myHorses.map((h) => h._id) } })
    .populate('horse', 'name')
    .sort({ date: -1 });
  return ok(res, records, 'Your financial records fetched.');
});

router.use(protect);
router.get('/mine', authorize(ROLES.OWNER), listMine);
router.get('/', authorize(ROLES.MANAGER), ctrl.list);
router.get('/:id', authorize(ROLES.MANAGER), ctrl.getOne);
router.post('/', authorize(ROLES.MANAGER), ctrl.createOne);
router.put('/:id', authorize(ROLES.MANAGER), ctrl.updateOne);
router.delete('/:id', authorize(ROLES.MANAGER), ctrl.removeOne);

module.exports = router;
