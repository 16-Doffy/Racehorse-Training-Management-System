const mongoose = require('mongoose');
const StableAssignment = require('../../models/StableAssignment');
const Stall = require('../../models/Stall');
const User = require('../../models/User');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const { ROLES } = require('../../constants/roles');
const Treatment = require('../../models/Treatment');
const Horse = require('../../models/Horse');
const { syncCareTasks } = require('../health/treatmentCare.service');
const { pushNotification } = require('../alerts/notification.service');
const { ensureFeedingTasks } = require('../../realtime/dailyTaskGenerator');
const { runTransaction, operationError } = require('../../utils/transaction');
const { handOverTasks, isActiveGroom } = require('./stallCaretaker.service');
const { placementProblem } = require('./placement');

// Owners, trainers and vets see the stalls of their own horses; the Manager and grooms see the
// whole stable (a groom's map shows neighbouring stalls too). This used to return every horse's
// stall and caretaker to anyone logged in — an owner's page filtered them out on screen, but the
// API still handed over other owners' data.
const listAssignments = asyncHandler(async (req, res) => {
  const filter = {};
  const horse = await horseFilter(req.user, req.query.horse);
  if (horse !== undefined) filter.horse = horse;

  const assignments = await StableAssignment.find(filter)
    .populate('horse', 'name healthStatus')
    .populate('assignedCaretaker', 'name')
    .populate('stall', 'code zone zoneName type status')
    .sort({ stableBlock: 1 });
  return ok(res, assignments, 'Stable assignments fetched.');
});

/**
 * Puts a horse in a stall and names the groom responsible for it.
 *
 * This record drives the daily feeding tasks and is one of the training readiness gates, so it is
 * validated rather than stored as given: the horse exists and is still managed, one horse per stall,
 * and the caretaker must be an active groom. Changing the caretaker hands over the horse's outstanding automatic tasks too — otherwise
 * today's feeds stay on the previous groom's list.
 */
/**
 * The horse being placed, written first inside the placement's transaction. Archiving writes the same
 * record (and then frees the horse's stall), so a placement and an archive running together never
 * both go through: either the placement sees the horse archived, or the archive removes the stall it
 * just got. A horse that does not exist, or that the club no longer manages, gets no stall.
 */
async function claimHorse(horse, session) {
  const claimed = await Horse.findOneAndUpdate(
    { _id: horse, isArchived: { $ne: true } },
    { $set: { updatedAt: new Date() } },
    { new: true, session, timestamps: false }
  ).select('name healthStatus');
  if (claimed) return claimed;
  if (await Horse.exists({ _id: horse }).session(session)) {
    throw operationError(409, 'Ngựa này đã ngừng quản lý — đưa ngựa trở lại quản lý trước khi xếp chuồng.');
  }
  throw operationError(404, 'Không tìm thấy ngựa.');
}

const upsertAssignment = asyncHandler(async (req, res) => {
  const { horse, stableBlock, assignedCaretaker } = req.body;
  if (!horse || (!stableBlock && !req.body.stall)) return fail(res, 'horse và chuồng (stall hoặc stableBlock) là bắt buộc.', 400);
  if (!mongoose.isValidObjectId(horse)) return fail(res, 'Ngựa không hợp lệ.', 400);
  if (req.body.stall && !mongoose.isValidObjectId(req.body.stall)) return fail(res, 'Chuồng không hợp lệ.', 400);
  if (!(await canAccessHorse(req.user, horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  if (assignedCaretaker) {
    const groom = await User.exists({ _id: assignedCaretaker, role: ROLES.GROOM, isActive: true });
    if (!groom) return fail(res, 'Người chăm sóc phải là nhân viên chăm sóc đang hoạt động.', 400);
  }

  // The checks and the write in one transaction, after writing the horse and the stall (see
  // claimHorse, Stall.claim): an archive, a maintenance, a retirement or another placement on the
  // same records makes one of them re-run against what the other saved.
  const { assignment, block, stall, changedCaretaker, horseName } = await runTransaction(async (session) => {
    const horseDoc = await claimHorse(horse, session);
    // A stall on the map (`stall`), or free text as before; text that matches a stall's code is that stall.
    const target = await Stall.claim(req.body.stall ? { _id: req.body.stall } : { code: String(stableBlock).trim().toUpperCase() }, session);
    if (req.body.stall && !target) throw operationError(404, 'Không tìm thấy chuồng.');
    if (target && !target.isActive) throw operationError(409, `Chuồng ${target.code} đã ngừng sử dụng.`);
    if (target && target.status === 'maintenance') throw operationError(409, `Chuồng ${target.code} đang bảo trì${target.maintenanceNote ? ` (${target.maintenanceNote})` : ''} — chọn chuồng khác.`);
    // A quarantined horse goes to the isolation zone only (placement.js).
    const wrongZone = placementProblem(horseDoc, target);
    if (wrongZone?.level === 'block') throw operationError(409, wrongZone.message);

    const code = target ? target.code : String(stableBlock).trim();
    const occupied = await StableAssignment.findOne({ $or: [{ stableBlock: code }, ...(target ? [{ stall: target._id }] : [])], horse: { $ne: horse } })
      .populate('horse', 'name')
      .session(session);
    if (occupied) throw operationError(409, `Chuồng "${code}" đang có ngựa ${occupied.horse?.name || 'khác'}.`);

    // A stall on the map has its own groom (Stall.caretaker): the horse placed there gets them, unless
    // the Manager names someone, who then becomes the stall's groom.
    let caretaker = assignedCaretaker || null;
    if (target && caretaker && String(target.caretaker || '') !== String(caretaker)) {
      target.caretaker = caretaker;
      await target.save({ session });
    } else if (target && !caretaker && target.caretaker && (await isActiveGroom(target.caretaker, session))) {
      caretaker = target.caretaker;
    }

    const previous = await StableAssignment.findOne({ horse }).select('assignedCaretaker').session(session);
    const saved = await StableAssignment.findOneAndUpdate(
      { horse },
      { horse, stableBlock: code, stall: target ? target._id : null, assignedCaretaker: caretaker },
      { new: true, upsert: true, runValidators: true, session }
    );

    const changed = String(previous?.assignedCaretaker || '') !== String(saved.assignedCaretaker || '');
    if (changed) await handOverTasks({ horse, from: previous?.assignedCaretaker, to: saved.assignedCaretaker, session });
    return { assignment: saved, block: code, stall: target, changedCaretaker: changed, horseName: horseDoc.name };
  });

  if (assignment.assignedCaretaker) {
    await ensureFeedingTasks({ horseIds: [horse] });
    // A horse already under treatment brings its care orders to whoever now looks after it.
    const treatments = await Treatment.find({ horse, status: 'ongoing' });
    for (const treatment of treatments) {
      // eslint-disable-next-line no-await-in-loop
      await syncCareTasks(treatment);
    }
    if (changedCaretaker) {
      await pushNotification({
        recipientUser: assignment.assignedCaretaker,
        horse,
        type: 'task_assigned',
        severity: 'info',
        message: `🐴 Bạn được phân công chăm sóc ${horseName || 'ngựa'} tại ${block}. Việc hàng ngày của ngựa đã có trong danh sách của bạn.`,
      });
    }
  }

  await logAction({
    actorId: req.user._id,
    action: 'stableAssignment.save',
    targetModel: 'StableAssignment',
    targetId: assignment._id,
    metadata: { stableBlock: block, stall: stall ? stall.code : null, caretakerChanged: changedCaretaker },
  });
  return created(res, assignment, 'Stable assignment saved.');
});

const deleteAssignment = asyncHandler(async (req, res) => {
  const assignment = await StableAssignment.findByIdAndDelete(req.params.id);
  if (!assignment) return fail(res, 'Assignment not found.', 404);
  await logAction({ actorId: req.user._id, action: 'stableAssignment.delete', targetModel: 'StableAssignment', targetId: assignment._id });
  return ok(res, null, 'Stable assignment removed.');
});

module.exports = { listAssignments, upsertAssignment, deleteAssignment };
