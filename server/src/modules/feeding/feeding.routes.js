const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const crudFactory = require('../../utils/crudFactory');
const FeedingSchedule = require('../../models/FeedingSchedule');
const { ensureFeedingTasks } = require('../../realtime/dailyTaskGenerator');

const ctrl = crudFactory(FeedingSchedule, {
  populate: [{ path: 'horse', select: 'name' }, { path: 'approvedBy', select: 'name' }],
  label: 'Feeding schedule',
  scopeByHorse: true,
  // Only the Head Trainer or Manager may write a ration, so whoever saves it is its approver.
  // Without this, rations created through the UI stayed "pending" forever.
  stamp: (req) => ({ approvedBy: req.user._id }),
  // The groom should see the new meal on their list now, not after the next hourly run.
  afterWrite: (item) => ensureFeedingTasks({ horseIds: [item.horse], onlyUpcoming: true }),
});

router.use(protect);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), ctrl.createOne);
router.put('/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), ctrl.updateOne);
router.delete('/:id', authorize(ROLES.MANAGER), ctrl.removeOne);

module.exports = router;
