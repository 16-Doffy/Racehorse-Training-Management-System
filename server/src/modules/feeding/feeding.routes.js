const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const crudFactory = require('../../utils/crudFactory');
const FeedingSchedule = require('../../models/FeedingSchedule');

// Scaffold module: full CRUD wired up now, detailed nutrition-planning UI/logic comes later.
const ctrl = crudFactory(FeedingSchedule, {
  populate: [{ path: 'horse', select: 'name' }, { path: 'approvedBy', select: 'name' }],
  label: 'Feeding schedule',
  // An Owner should see their own horses' rations, not the whole stable's.
  scopeByHorse: true,
});

router.use(protect);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), ctrl.createOne);
router.put('/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), ctrl.updateOne);
router.delete('/:id', authorize(ROLES.MANAGER), ctrl.removeOne);

module.exports = router;
