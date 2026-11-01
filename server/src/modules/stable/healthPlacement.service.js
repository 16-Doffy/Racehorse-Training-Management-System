const StableAssignment = require('../../models/StableAssignment');
const Stall = require('../../models/Stall');
const Horse = require('../../models/Horse');
const Treatment = require('../../models/Treatment');
const CareRoutine = require('../../models/CareRoutine');
const Notification = require('../../models/Notification');
const { ROLES } = require('../../constants/roles');
const { runTransaction } = require('../../utils/transaction');
const { pushNotification, notifyHorseStaff } = require('../alerts/notification.service');
const { logAction } = require('../audit/audit.service');
// Read at call time: stallCaretaker.service and the daily generator load each other.
const stallCaretaker = require('./stallCaretaker.service');

/**
 * The horse moves with its health, without the Manager placing it by hand (the club's choice of
 * 01/11/2026):
 * - quarantined (an illness that may spread): to a free isolation stall;
 * - injured: to a free recovery stall;
 * - eligible again: back to its own ordinary stall, which was kept for it meanwhile (`homeStall`:
 *   nobody else is placed there while the horse is away);
 * - under monitoring: it stays where it is.
 * The stall's groom takes the horse and its open work, as in any placement. When no stall of the
 * kind is free, the Manager is told and the move waits (`pendingMove`): the hourly run tries again.
 */
const WANTED = { quarantined: 'isolation', injured: 'recovery', eligible: 'standard' };
const KIND_LABELS = { isolation: 'chuồng cách ly', recovery: 'chuồng hồi phục', standard: 'chuồng thường' };
const RETRY_NOTICE_HOURS = 24;

/** The stalls of a kind that are free: in use, not under maintenance, nobody in them, not kept for a horse away. */
async function freeStalls(type, session) {
  const [stalls, taken] = await Promise.all([
    Stall.find({ type, isActive: true, status: { $ne: 'maintenance' } }).sort({ zone: 1, order: 1, code: 1 }).session(session || null),
    StableAssignment.find({ $or: [{ stall: { $ne: null } }, { homeStall: { $ne: null } }] }).select('stall homeStall').session(session || null),
  ]);
  const busy = new Set(taken.flatMap((a) => [a.stall, a.homeStall].filter(Boolean).map(String)));
  return stalls.filter((s) => !busy.has(String(s._id)));
}

/** Moves the horse into `target`, the stall's groom taking it (and its open work); `homeStall` as given. */
async function moveInto({ horseId, target, homeStall }) {
  return runTransaction(async (session) => {
    const stall = await Stall.claim({ _id: target._id, isActive: true, status: { $ne: 'maintenance' } }, session);
    if (!stall) return null;
    const other = await StableAssignment.findOne({ horse: { $ne: horseId }, $or: [{ stall: stall._id }, { homeStall: stall._id }] }).session(session);
    if (other) return null;
    const previous = await StableAssignment.findOne({ horse: horseId }).session(session);
    if (!previous) return null;
    const caretaker = stall.caretaker && (await stallCaretaker.isActiveGroom(stall.caretaker, session)) ? stall.caretaker : previous.assignedCaretaker || null;
    const from = previous.assignedCaretaker;
    previous.stall = stall._id;
    previous.stableBlock = stall.code;
    previous.assignedCaretaker = caretaker;
    previous.homeStall = homeStall || null;
    previous.pendingMove = null;
    await previous.save({ session });
    if (String(from || '') !== String(caretaker || '')) await stallCaretaker.handOverTasks({ horse: horseId, from, to: caretaker, session });
    return { stall, caretaker, changedCaretaker: String(from || '') !== String(caretaker || '') };
  });
}

/** Once a day at most: the Manager is told a move is waiting (for a free stall, or `failed`: the move went wrong). */
async function tellWaiting(horse, kind, where, { failed = false } = {}) {
  const since = new Date(Date.now() - RETRY_NOTICE_HOURS * 3600 * 1000);
  if (await Notification.exists({ recipientRole: ROLES.MANAGER, horse: horse._id, type: 'horse_assigned', createdAt: { $gte: since }, message: { $regex: 'chưa có .* trống|chưa chuyển được' } })) return;
  await pushNotification({
    recipientRole: ROLES.MANAGER,
    horse: horse._id,
    type: 'horse_assigned',
    severity: 'warning',
    message: failed
      ? `⚠️ ${horse.name} cần sang ${KIND_LABELS[kind]} (${where}) nhưng hệ thống chưa chuyển được — sẽ tự thử lại mỗi giờ; cần gấp thì chuyển tay.`
      : `⚠️ ${horse.name} cần sang ${KIND_LABELS[kind]} (${where}) nhưng chưa có ${KIND_LABELS[kind]} trống — thêm chuồng hoặc chuyển tay; hệ thống sẽ tự chuyển khi có chỗ.`,
  });
}

/** The move waits: kept for the next try, and the Manager told. */
async function waitForStall(assignment, horse, kind, where, options) {
  if (assignment.pendingMove !== kind) await StableAssignment.updateOne({ _id: assignment._id }, { $set: { pendingMove: kind } });
  await tellWaiting(horse, kind, where, options);
  return { waiting: kind };
}

/**
 * Puts the horse where its health says, if it is not there. Returns what happened:
 * { moved: { from, to } } | { waiting: kind } | null (nothing to do).
 * `retrying`: called for a horse already waiting, so the stall it leaves is not offered round again here.
 */
async function followHealth(horseId, { reason = 'health', actor = null, retrying = false } = {}) {
  if (!horseId) return null;
  const horse = await Horse.findById(horseId).select('name healthStatus isArchived');
  const kind = horse && !horse.isArchived ? WANTED[horse.healthStatus] : null;
  if (!kind) {
    // Under monitoring it stays where it is, so it no longer waits for anything.
    await StableAssignment.updateOne({ horse: horseId, pendingMove: { $ne: null } }, { $set: { pendingMove: null } });
    return null;
  }
  const assignment = await StableAssignment.findOne({ horse: horseId }).populate('stall', 'code zone type').populate('homeStall', 'code zone type isActive status');
  // A horse with no stall on the map (none, or a free-text one) is placed by the Manager.
  if (!assignment?.stall) return null;
  const here = assignment.stall.type || 'standard';
  if (here === kind) {
    // Already in its place: an ordinary stall needs nothing kept for it any more.
    if (kind === 'standard' && (assignment.homeStall || assignment.pendingMove)) await StableAssignment.updateOne({ _id: assignment._id }, { $set: { homeStall: null, pendingMove: null } });
    else if (assignment.pendingMove) await StableAssignment.updateOne({ _id: assignment._id }, { $set: { pendingMove: null } });
    return null;
  }

  // A club without recovery stalls keeps an injured horse where it is (isolation is asked for regardless).
  if (kind === 'recovery' && !(await Stall.exists({ type: 'recovery', isActive: true }))) return null;
  let target = null;
  let keep = assignment.homeStall?._id || null;
  if (kind === 'standard') {
    const home = assignment.homeStall;
    const free = await freeStalls('standard');
    // Back to its own stall (kept for it); if that one left use, a free one in the same zone, else any.
    const homeUsable = home && home.isActive && home.status !== 'maintenance' && !(await StableAssignment.exists({ stall: home._id, horse: { $ne: horseId } }));
    target = homeUsable ? home : free.find((s) => home && s.zone === home.zone) || free[0] || null;
    keep = null;
  } else {
    target = (await freeStalls(kind))[0] || null;
    // Leaving an ordinary stall keeps it for the horse; moving between isolation and recovery keeps the one already kept.
    if (here === 'standard') keep = assignment.stall._id;
  }
  const from = assignment.stall.code;
  if (!target) return waitForStall(assignment, horse, kind, `đang ở ${from}`);
  const moved = await moveInto({ horseId, target, homeStall: keep });
  // Another horse took the stall at the last moment: this one waits like any other.
  if (!moved) return waitForStall(assignment, horse, kind, `đang ở ${from}`);

  const to = moved.stall.code;
  const why = kind === 'standard' ? 'đã đủ điều kiện' : kind === 'isolation' ? 'cần cách ly' : 'đang chấn thương';
  const kept = keep && kind !== 'standard' ? ` Chuồng ${assignment.homeStall?.code || from} được giữ chỗ cho ngựa.` : '';
  const message = `🏥 ${horse.name} ${why}: đã tự chuyển từ ${from} sang ${KIND_LABELS[kind]} ${to}.${kept}`;
  await pushNotification({ recipientRole: ROLES.MANAGER, horse: horse._id, type: 'horse_assigned', severity: kind === 'standard' ? 'info' : 'warning', message });
  await notifyHorseStaff({ staff: 'trainer', horse: horse._id, type: 'horse_assigned', severity: 'info', message });
  if (moved.caretaker) {
    await pushNotification({
      recipientUser: moved.caretaker,
      horse: horse._id,
      type: 'task_assigned',
      severity: 'info',
      message: moved.changedCaretaker
        ? `🐴 ${horse.name} vừa chuyển vào chuồng ${to} (${KIND_LABELS[kind]}) do bạn chăm sóc. Việc hằng ngày của ngựa đã có trong danh sách của bạn.`
        : `🐴 ${horse.name} vừa chuyển sang chuồng ${to} (${KIND_LABELS[kind]}).`,
    });
  }
  // The horse's care follows it: today's meals, the vet's orders and the jobs handed out for it.
  const { ensureFeedingTasks } = require('../../realtime/dailyTaskGenerator');
  const { syncCareTasks } = require('../health/treatmentCare.service');
  const { syncRoutineTasks } = require('./careRoutine.service');
  await ensureFeedingTasks({ horseIds: [horse._id] });
  for (const t of await Treatment.find({ horse: horse._id, status: 'ongoing' })) await syncCareTasks(t); // eslint-disable-line no-await-in-loop
  for (const r of await CareRoutine.find({ horse: horse._id, status: 'active' })) await syncRoutineTasks(r); // eslint-disable-line no-await-in-loop
  // Every move is on the record; no actor means the system did it by itself (an injury marker, a retry).
  await logAction({ actorId: actor, action: 'stableAssignment.follow_health', targetModel: 'StableAssignment', targetId: assignment._id, metadata: { horse: horse._id, from, to, kind, reason, bySystem: !actor } });
  // The stall it left may be the one another horse is waiting for.
  if (!retrying) await moveWaitingHorses();
  return { moved: { from, to } };
}

/** Hourly: the moves that waited are tried again. One that fails does not stop the others. */
async function retryWaitingMoves() {
  const waiting = await StableAssignment.find({ pendingMove: { $ne: null } }).select('horse');
  let moved = 0;
  for (const a of waiting) {
    try {
      // eslint-disable-next-line no-await-in-loop
      if ((await followHealth(a.horse, { reason: 'retry', retrying: true }))?.moved) moved += 1;
    } catch (err) {
      console.error(`[health-placement] retry failed for ${a.horse}:`, err.message);
    }
  }
  return moved;
}

/** A stall may have come free (a horse left it, one was added or back in use): those waiting go now. Never fails the caller. */
async function moveWaitingHorses() {
  try {
    return await retryWaitingMoves();
  } catch (err) {
    console.error('[health-placement] moving the waiting horses failed:', err.message);
    return 0;
  }
}

/**
 * followHealth for a caller whose own work is already done (the vet's exam is saved): a move that goes
 * wrong must not fail it. The move then waits for the hourly run and the Manager is told.
 */
async function followHealthSafely(horseId, options) {
  try {
    return await followHealth(horseId, options);
  } catch (err) {
    console.error(`[health-placement] move failed for ${horseId}:`, err.message);
    try {
      const horse = await Horse.findById(horseId).select('name healthStatus');
      const kind = WANTED[horse?.healthStatus];
      const assignment = kind ? await StableAssignment.findOne({ horse: horseId }).populate('stall', 'code') : null;
      if (assignment) return await waitForStall(assignment, horse, kind, `đang ở ${assignment.stall?.code || assignment.stableBlock}`, { failed: true });
    } catch (noted) {
      console.error(`[health-placement] could not note the failed move of ${horseId}:`, noted.message);
    }
    return null;
  }
}

module.exports = { followHealth, followHealthSafely, retryWaitingMoves, moveWaitingHorses, freeStalls };
