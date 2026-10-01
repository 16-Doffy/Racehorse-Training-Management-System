const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const crudFactory = require('../../utils/crudFactory');
const RaceEntry = require('../../models/RaceEntry');
const Horse = require('../../models/Horse');
const { getMedicalBlock } = require('../training/readiness.service');

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

/**
 * A horse the vet has grounded can't be entered for a race: the same medical block that stops a
 * training session (an active lock, or an injured/quarantined status) stops a registration too.
 * Checked when an entry is created, moved to another horse, or put back to registered/confirmed —
 * recording a result or withdrawing a grounded horse stays possible.
 */
async function refuseGroundedHorse(req, { existing }) {
  const horseId = req.body.horse || existing?.horse;
  const nextStatus = req.body.status || existing?.status || 'registered';
  const entering = !existing || (req.body.horse && String(req.body.horse) !== String(existing.horse));
  const reviving = existing && ['registered', 'confirmed'].includes(nextStatus) && nextStatus !== existing.status;
  if (!entering && !reviving) return null;

  const block = await getMedicalBlock(horseId);
  return block ? `Không thể đăng ký giải cho ngựa này: ${block}` : null;
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
  validate: refuseGroundedHorse,
});

router.use(protect);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorize(ROLES.HEAD_TRAINER), ctrl.createOne);
router.put('/:id', authorize(ROLES.HEAD_TRAINER), ctrl.updateOne);
router.delete('/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), ctrl.removeOne);

module.exports = router;
