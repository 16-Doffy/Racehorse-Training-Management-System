const Stall = require('../../models/Stall');
const StableAssignment = require('../../models/StableAssignment');
const DailyTask = require('../../models/DailyTask');
const Treatment = require('../../models/Treatment');
const User = require('../../models/User');
const { ROLES } = require('../../constants/roles');
const { syncCareTasks } = require('../health/treatmentCare.service');
const { pushNotification } = require('../alerts/notification.service');
const { ensureFeedingTasks } = require('../../realtime/dailyTaskGenerator');
const { runTransaction, operationError, afterCommit } = require('../../utils/transaction');

/**
 * A stall's groom (Stall.caretaker). The Manager gives each stall a groom, empty or not; the groom's app
 * lists their stalls, and the horse standing in a stall has the stall's groom as its caretaker
 * (StableAssignment.assignedCaretaker, which the feeding tasks, the readiness gate and the checklist
 * read). Giving a stall a groom therefore also hands its horse over.
 */

/** True when `id` is a groom whose account is active. */
async function isActiveGroom(id, session) {
  if (!id) return false;
  const query = User.exists({ _id: id, role: ROLES.GROOM, isActive: true });
  return Boolean(session ? await query.session(session) : await query);
}

/**
 * Gives a horse's unfinished automatic work (feeds, post-session care, care orders) to its new groom,
 * from whoever holds it — not only from the groom just replaced: after a stall was left without a
 * groom and then given one, the work was still with the groom from before (there was no `from` any
 * more). Tasks the trainer handed to a specific person by hand stay where they were put.
 */
async function handOverTasks({ horse, from, to, session }) {
  if (!to || (from && String(from) === String(to))) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await DailyTask.updateMany(
    {
      horse,
      assignedTo: { $ne: to },
      status: 'pending',
      scheduledDate: { $gte: today },
      $or: [{ taskType: 'feeding' }, { trainingSession: { $ne: null } }, { treatment: { $ne: null } }],
    },
    { assignedTo: to },
    { session }
  );
}

/** After a horse got a groom: today's feeds and the orders of its ongoing treatments reach them. */
async function bringWorkTo(horse) {
  await ensureFeedingTasks({ horseIds: [horse] });
  const treatments = await Treatment.find({ horse, status: 'ongoing' });
  for (const treatment of treatments) {
    // eslint-disable-next-line no-await-in-loop
    await syncCareTasks(treatment);
  }
}

/**
 * Gives one stall the groom `caretaker` (null: no groom), with the horse standing in it, in one
 * transaction. Throws 404 when the stall is not in use. Returns the stall and the horse whose groom
 * changed: { stalls: [stall], moved: [{ horse, horseName, code, from }] }.
 */
async function setStallCaretaker({ stallId, caretaker }) {
  const groom = caretaker || null;
  if (groom && !(await isActiveGroom(groom))) throw operationError(400, 'Người phụ trách chuồng phải là nhân viên chăm sóc đang hoạt động.');

  const result = await runTransaction(async (session) => {
    const ids = (await Stall.find({ _id: stallId, isActive: true }).select('_id').session(session)).map((s) => s._id);
    if (!ids.length) throw operationError(404, 'Không tìm thấy chuồng.');
    const stalls = [];
    for (const id of ids) {
      // Written first, like every stall change (Stall.claim), so a placement at the same moment re-runs
      // against the new groom instead of giving the horse the old one.
      // eslint-disable-next-line no-await-in-loop
      const stall = await Stall.claim({ _id: id }, session);
      stall.caretaker = groom;
      // eslint-disable-next-line no-await-in-loop
      await stall.save({ session });
      stall.$session(null);
      stalls.push(stall);
    }
    const assignments = await StableAssignment.find({ stall: { $in: ids } }).populate('horse', 'name').session(session);
    const moved = [];
    for (const assignment of assignments) {
      if (String(assignment.assignedCaretaker || '') === String(groom || '')) continue;
      const from = assignment.assignedCaretaker;
      // eslint-disable-next-line no-await-in-loop
      await handOverTasks({ horse: assignment.horse?._id || assignment.horse, from, to: groom, session });
      assignment.assignedCaretaker = groom;
      // eslint-disable-next-line no-await-in-loop
      await assignment.save({ session });
      moved.push({ horse: assignment.horse?._id || assignment.horse, horseName: assignment.horse?.name, code: assignment.stableBlock, from });
    }
    return { stalls, moved };
  });

  const { stalls, moved } = result;
  await afterCommit('stall.caretaker', async () => {
    if (groom) {
      for (const m of moved) {
        // eslint-disable-next-line no-await-in-loop
        await bringWorkTo(m.horse);
      }
      const horses = moved.map((m) => m.horseName).filter(Boolean);
      await pushNotification({
        recipientUser: groom,
        horse: moved.length === 1 ? moved[0].horse : undefined,
        type: 'task_assigned',
        severity: 'info',
        message: `🏠 Bạn được giao chuồng ${stalls.map((s) => s.code).join(', ')}${
          horses.length ? ` (ngựa ${horses.join(', ')}). Việc hằng ngày của ngựa đã có trong danh sách của bạn.` : ' (đang trống).'
        }`,
      });
    }
    // Whoever looked after a horse before hears that it has gone to someone else.
    const byPrevious = new Map();
    moved.filter((m) => m.from).forEach((m) => byPrevious.set(String(m.from), [...(byPrevious.get(String(m.from)) || []), m]));
    for (const [from, list] of byPrevious) {
      // eslint-disable-next-line no-await-in-loop
      await pushNotification({
        recipientUser: from,
        horse: list.length === 1 ? list[0].horse : undefined,
        type: 'task_assigned',
        severity: 'info',
        message: `🏠 ${list.map((m) => `${m.horseName || 'Ngựa'} (${m.code})`).join(', ')} đã chuyển sang người chăm sóc khác. Việc chưa làm của ngựa đã rời khỏi danh sách của bạn.`,
      });
    }
  });
  return result;
}

module.exports = { isActiveGroom, handOverTasks, bringWorkTo, setStallCaretaker };
