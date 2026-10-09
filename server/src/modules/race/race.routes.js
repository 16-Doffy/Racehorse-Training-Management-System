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
const TrainingSession = require('../../models/TrainingSession');
const { trialsForEntry, startOfToday } = require('./raceDecision.service');

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
  const invalid = entryProblem(req.body, existing);
  if (invalid) return { status: 400, message: invalid };
  const horseId = req.body.horse || existing?.horse;
  const nextStatus = req.body.status || existing?.status || 'registered';
  const entering = !existing || (req.body.horse && String(req.body.horse) !== String(existing.horse));
  const reviving = existing && ['registered', 'confirmed'].includes(nextStatus) && nextStatus !== existing.status;
  if (!entering && !reviving) return null;

  const block = await getRaceBlock(horseId);
  return block ? `Không thể đăng ký giải cho ngựa này: ${block}` : null;
}

// A race is entered before it is run, over a distance a racecourse actually holds. The result of a
// race (and "completed") goes through PATCH /:id/results, which also books the prize money.
const RACE_DISTANCE = [400, 6000];
function entryProblem(body, existing) {
  if (existing && body.status !== undefined && body.status !== existing.status) {
    return body.status === 'completed'
      ? 'Nhập kết quả giải qua "Cập nhật kết quả" (thứ hạng, thời gian, tiền thưởng).'
      : 'Tham gia hay rút khỏi giải là quyết định của HLV — dùng "Quyết định dự giải".';
  }
  if (!existing && body.status !== undefined && body.status !== 'registered') {
    return 'Giải mới đăng ký ở trạng thái "Đã đăng ký"; xác nhận tham gia sau qua "Quyết định dự giải".';
  }
  if (body.raceDate !== undefined) {
    const date = new Date(body.raceDate);
    if (Number.isNaN(date.getTime())) return 'Ngày đua không hợp lệ.';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const moved = !existing || date.getTime() !== new Date(existing.raceDate).getTime();
    if (moved && date < today) return 'Ngày đua phải từ hôm nay trở đi — không đăng ký giải đã diễn ra.';
  }
  if (body.distance !== undefined && body.distance !== null && body.distance !== '') {
    const d = Number(body.distance);
    if (!Number.isFinite(d) || d < RACE_DISTANCE[0] || d > RACE_DISTANCE[1]) {
      return `Cự ly giải phải trong khoảng ${RACE_DISTANCE[0]}–${RACE_DISTANCE[1]} m.`;
    }
  } else if (!existing) {
    return 'Nhập cự ly của giải — kế hoạch huấn luyện chia giai đoạn theo cự ly này.';
  }
  if (body.surface !== undefined && body.surface !== null && body.surface !== '' && !RaceEntry.SURFACES.includes(body.surface)) {
    return 'Mặt sân không hợp lệ.';
  }
  return null;
}

const DECISIONS = ['confirmed', 'withdrawn'];
const DECISION_WORDS = { confirmed: 'xác nhận tham gia', withdrawn: 'rút khỏi' };

/**
 * The trainer's decision whether the horse goes. A trial result is evidence, not the decision: a passed
 * trial does not make the horse fit to race, so the medical state is checked again now. Confirming with
 * no trial run for this entry, or after a trial that missed its targets, is an exception and needs a
 * reason; so does withdrawing. Who, when, on which trial and why are kept on the entry; a new decision
 * clears a pending "review" mark.
 * POST /races/:id/decision { decision: 'confirmed'|'withdrawn', trialSession?, reason? }
 */
const recordDecision = asyncHandler(async (req, res) => {
  const entry = await RaceEntry.findById(req.params.id);
  if (!entry) return fail(res, 'Race entry not found.', 404);
  if (!(await canAccessHorse(req.user, entry.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  const { decision, trialSession } = req.body || {};
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!DECISIONS.includes(decision)) return fail(res, 'Chọn quyết định: tham gia hoặc rút.', 400);
  if (!['registered', 'confirmed', 'withdrawn'].includes(entry.status)) return fail(res, 'Giải này đã có kết quả — không đổi quyết định được.', 409);
  if (new Date(entry.raceDate) < startOfToday()) return fail(res, 'Giải đã diễn ra — nhập kết quả thay vì quyết định.', 409);

  let trial = null;
  let exception = false;
  if (decision === 'confirmed') {
    const block = await getRaceBlock(entry.horse);
    if (block) return fail(res, `Không xác nhận được: ${block}`, 409);
    const trials = await trialsForEntry(entry);
    if (trialSession) {
      trial = trials.find((t) => String(t._id) === String(trialSession));
      if (!trial) return fail(res, 'Buổi chạy thử đã chọn không thuộc giải này, hoặc chưa chạy xong.', 400);
    } else {
      trial = trials[0] || null;
    }
    exception = !trial;
    if (exception && !reason) return fail(res, 'Chưa có buổi chạy thử nào cho giải này đã chạy — xác nhận là ngoại lệ, hãy ghi lý do theo quy định CLB.', 400);
    if (trial && trial.outcome?.met === false && !reason) return fail(res, 'Buổi chạy thử chưa đạt mục tiêu — ghi lý do vẫn cho tham gia.', 400);
  } else if (!reason) {
    return fail(res, 'Ghi lý do rút khỏi giải.', 400);
  }

  const claimed = await RaceEntry.findOneAndUpdate(
    { _id: entry._id, status: entry.status },
    {
      $set: {
        status: decision,
        decision: {
          status: decision,
          by: req.user._id,
          at: new Date(),
          trialSession: trial?._id || null,
          trialMet: trial ? trial.outcome?.met ?? null : null,
          exception,
          reason: reason || undefined,
        },
        reviewNeeded: false,
      },
      $unset: { reviewReason: 1, reviewFlaggedAt: 1 },
    },
    { new: true }
  );
  if (!claimed) return fail(res, 'Đăng ký vừa được người khác thay đổi — tải lại rồi thử lại.', 409);

  const horse = await Horse.findById(entry.horse).select('name owner');
  if (horse?.owner) {
    await pushNotification({
      recipientUser: horse.owner,
      horse: horse._id,
      type: 'race_decision',
      severity: 'info',
      message: `🏁 HLV đã ${DECISION_WORDS[decision]} ${entry.raceName} (${new Date(entry.raceDate).toLocaleDateString('vi-VN')}) cho ${horse.name}${reason ? ` — ${reason}` : trial ? ' dựa trên buổi chạy thử' : ''}.`,
    });
  }
  await logAction({
    actorId: req.user._id,
    action: `race.decision_${decision}`,
    targetModel: 'RaceEntry',
    targetId: entry._id,
    metadata: { trialSession: trial?._id || null, trialMet: trial?.outcome?.met ?? null, exception, reason: reason || null, from: entry.status },
  });
  return ok(res, claimed, 'Race decision recorded.');
});

/** The trial runs linked to an entry, newest first — what the decision modal shows as evidence. */
const listEntryTrials = asyncHandler(async (req, res) => {
  const entry = await RaceEntry.findById(req.params.id);
  if (!entry) return fail(res, 'Race entry not found.', 404);
  if (!(await canAccessHorse(req.user, entry.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  const linked = await TrainingSession.find({ raceEntry: entry._id })
    .select('scheduledAt status outcome metrics actualStartAt actualEndAt simulatedWorkSec videoUrl performanceRating prescription')
    .sort({ scheduledAt: -1 });
  return ok(res, linked, 'Trials fetched.');
});

const ctrl = crudFactory(RaceEntry, {
  populate: [{ path: 'horse', select: 'name' }, { path: 'registeredBy', select: 'name' }, { path: 'decision.by', select: 'name' }],
  defaultSort: { raceDate: -1 },
  label: 'Race entry',
  // Same per-role visibility as training/health: an Owner sees their own horses' race entries,
  // a Head Trainer those of horses assigned to them.
  scopeByHorse: true,
  stamp: (req, { isCreate }) => (isCreate ? { registeredBy: req.user._id } : {}),
  afterWrite: recordAchievement,
  validate: refuseGroundedHorse,
  // Results, prize money and who registered are the server's to write.
  fields: ['horse', 'raceName', 'raceDate', 'distance', 'venue', 'surface', 'status'],
});

router.use(protect);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorize(ROLES.HEAD_TRAINER), ctrl.createOne);
router.put('/:id', authorize(ROLES.HEAD_TRAINER), ctrl.updateOne);
router.patch('/:id/results', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), recordResults);
router.post('/:id/decision', authorize(ROLES.HEAD_TRAINER), recordDecision);
router.get('/:id/trials', listEntryTrials);
router.delete('/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), ctrl.removeOne);

module.exports = router;
