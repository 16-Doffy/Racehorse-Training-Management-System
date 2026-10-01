const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const crudFactory = require('../../utils/crudFactory');
const RaceEntry = require('../../models/RaceEntry');
const Horse = require('../../models/Horse');
const { getRaceBlock } = require('../training/readiness.service');
const FinancialRecord = require('../../models/FinancialRecord');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, fail } = require('../../utils/apiResponse');
const { canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const { pushNotification } = require('../alerts/notification.service');
const { logAction } = require('../audit/audit.service');

/**
 * A finished race with a result becomes part of the horse's record. Horse.achievements is what
 * the horse profile and the Owner's screens show, and it used to be filled only by the seed script
 * — entering a result here changed nothing an owner could see.
 */
async function recordAchievement(entry) {
  if (entry.status !== 'completed' || !entry.result) return;
  // Replace rather than skip: a corrected result has to reach the profile too.
  await Horse.updateOne({ _id: entry.horse }, { $pull: { achievements: { race: entry.raceName } } });
  await Horse.updateOne(
    { _id: entry.horse },
    { $push: { achievements: { race: entry.raceName, result: entry.result, date: entry.raceDate } } }
  );
}

const vnd = (n) => `${Number(n).toLocaleString('vi-VN')} đ`;

/**
 * The prize money of a race is the owner's revenue. It becomes (or updates, or removes) one
 * FinancialRecord linked to the entry, so the owner's statement and the manager's report pick it
 * up without anyone typing it in twice.
 */
async function syncPrizeRecord(entry, user) {
  const existing = entry.financeRecord ? await FinancialRecord.findById(entry.financeRecord) : null;
  if (!entry.prizeMoney) {
    if (existing) await existing.deleteOne();
    entry.financeRecord = null;
    return;
  }
  const fields = {
    horse: entry.horse,
    type: 'revenue',
    category: 'prize',
    amount: entry.prizeMoney,
    date: entry.raceDate,
    note: `Tiền thưởng ${entry.raceName}${entry.position ? ` — hạng ${entry.position}` : ''}`,
  };
  if (existing) {
    Object.assign(existing, fields);
    await existing.save();
  } else {
    const record = await FinancialRecord.create({ ...fields, recordedBy: user._id });
    entry.financeRecord = record._id;
  }
}

/**
 * After the race: placing, time and prize money in one step. Completes the entry, puts the result
 * on the horse's record, turns the prize into revenue for the owner and tells them.
 * PATCH /races/:id/results { position, finishTime, prizeMoney, result }
 */
const recordResults = asyncHandler(async (req, res) => {
  const entry = await RaceEntry.findById(req.params.id);
  if (!entry) return fail(res, 'Race entry not found.', 404);
  if (!(await canAccessHorse(req.user, entry.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  if (entry.status === 'withdrawn') return fail(res, 'Ngựa đã rút khỏi giải này — không có kết quả để nhập.', 409);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (entry.raceDate > endOfToday) {
    return fail(res, `Giải chưa diễn ra (ngày đua ${entry.raceDate.toLocaleDateString('vi-VN')}) — chưa nhập kết quả được.`, 409);
  }

  const { position, finishTime, prizeMoney } = req.body;
  if (position !== undefined && position !== null && position !== '') {
    if (!Number.isInteger(Number(position)) || Number(position) < 1) return fail(res, 'Thứ hạng phải là số nguyên từ 1.', 400);
    entry.position = Number(position);
  }
  if (finishTime !== undefined) {
    const t = String(finishTime || '').trim();
    if (t.length > 20) return fail(res, 'Thời gian về đích quá dài.', 400);
    entry.finishTime = t || undefined;
  }
  if (prizeMoney !== undefined && prizeMoney !== null && prizeMoney !== '') {
    if (!Number.isFinite(Number(prizeMoney)) || Number(prizeMoney) < 0) return fail(res, 'Tiền thưởng không hợp lệ.', 400);
    entry.prizeMoney = Number(prizeMoney);
  }
  const typed = typeof req.body.result === 'string' ? req.body.result.trim() : '';
  entry.result = typed || [entry.position ? `Hạng ${entry.position}` : null, entry.finishTime].filter(Boolean).join(' — ') || entry.result;
  if (!entry.result) return fail(res, 'Nhập thứ hạng hoặc kết quả.', 400);

  entry.status = 'completed';
  await syncPrizeRecord(entry, req.user);
  await entry.save();
  await recordAchievement(entry);

  const horse = await Horse.findById(entry.horse).select('name owner');
  if (horse?.owner) {
    await pushNotification({
      recipientUser: horse.owner,
      horse: horse._id,
      type: 'race_result',
      severity: 'info',
      message: `🏆 ${horse.name} — ${entry.raceName}: ${entry.result}${entry.prizeMoney ? ` · tiền thưởng ${vnd(entry.prizeMoney)}` : ''}.`,
    });
  }
  await logAction({
    actorId: req.user._id,
    action: 'race.record_result',
    targetModel: 'RaceEntry',
    targetId: entry._id,
    metadata: { position: entry.position, prizeMoney: entry.prizeMoney },
  });
  return ok(res, entry, 'Race result recorded.');
});

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

  const block = await getRaceBlock(horseId);
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
router.patch('/:id/results', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), recordResults);
router.delete('/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), ctrl.removeOne);

module.exports = router;
