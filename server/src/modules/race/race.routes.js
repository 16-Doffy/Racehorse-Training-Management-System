const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const crudFactory = require('../../utils/crudFactory');
const RaceEntry = require('../../models/RaceEntry');

// Scaffold module: Head Trainer registers horses for races; results/leaderboard come later.
const ctrl = crudFactory(RaceEntry, {
  populate: [{ path: 'horse', select: 'name' }, { path: 'registeredBy', select: 'name' }],
  defaultSort: { raceDate: -1 },
  label: 'Race entry',
});

router.use(protect);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorize(ROLES.HEAD_TRAINER), (req, res, next) => {
  req.body.registeredBy = req.user._id;
  next();
}, ctrl.createOne);
router.put('/:id', authorize(ROLES.HEAD_TRAINER), ctrl.updateOne);
router.delete('/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), ctrl.removeOne);

module.exports = router;
