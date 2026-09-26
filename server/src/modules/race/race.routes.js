const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const crudFactory = require('../../utils/crudFactory');
const RaceEntry = require('../../models/RaceEntry');
const Horse = require('../../models/Horse');

/**
 * A finished race with a result becomes part of the horse's record. Horse.achievements is what
 * the horse profile and the Owner's screens show, and it used to be filled only by the seed script
 * — entering a result here changed nothing an owner could see.
 */
async function recordAchievement(entry) {
  if (entry.status !== 'completed' || !entry.result) return;
  await Horse.updateOne(
    { _id: entry.horse, 'achievements.race': { $ne: entry.raceName } },
    { $push: { achievements: { race: entry.raceName, result: entry.result, date: entry.raceDate } } }
  );
}

const ctrl = crudFactory(RaceEntry, {
  populate: [{ path: 'horse', select: 'name' }, { path: 'registeredBy', select: 'name' }],
  defaultSort: { raceDate: -1 },
  label: 'Race entry',
  // Same per-role visibility as training/health: an Owner sees their own horses' race entries,
  // a Head Trainer those of horses assigned to them.
  scopeByHorse: true,
  stamp: (req, { isCreate }) => (isCreate ? { registeredBy: req.user._id } : {}),
  afterWrite: recordAchievement,
});

router.use(protect);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorize(ROLES.HEAD_TRAINER), ctrl.createOne);
router.put('/:id', authorize(ROLES.HEAD_TRAINER), ctrl.updateOne);
router.delete('/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), ctrl.removeOne);

module.exports = router;
