const mongoose = require('mongoose');
const StableAssignment = require('../../models/StableAssignment');
const Stall = require('../../models/Stall');
const DailyTask = require('../../models/DailyTask');
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
 * validated rather than stored as given: one horse per stall, and the caretaker must be an active
 * groom. Changing the caretaker hands over the horse's outstanding automatic tasks too — otherwise
 * today's feeds stay on the previous groom's list.
 */
const upsertAssignment = asyncHandler(async (req, res) => {
  const { horse, stableBlock, assignedCaretaker } = req.body;
  if (!horse || (!stableBlock && !req.body.stall)) return fail(res, 'horse và chuồng (stall hoặc stableBlock) là bắt buộc.', 400);
  if (!(await canAccessHorse(req.user, horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  // A stall on the map (`stall`), or free text as before; text that matches a stall's code is that stall.
  let stall = null;
  if (req.body.stall) {
    if (!mongoose.isValidObjectId(req.body.stall)) return fail(res, 'Chuồng không hợp lệ.', 400);
    stall = await Stall.findById(req.body.stall);
    if (!stall) return fail(res, 'Không tìm thấy chuồng.', 404);
  } else {
    stall = await Stall.findOne({ code: String(stableBlock).trim().toUpperCase() });
  }
  if (stall && !stall.isActive) return fail(res, `Chuồng ${stall.code} đã ngừng sử dụng.`, 409);
  if (stall && stall.status === 'maintenance') return fail(res, `Chuồng ${stall.code} đang bảo trì${stall.maintenanceNote ? ` (${stall.maintenanceNote})` : ''} — chọn chuồng khác.`, 409);

  const block = stall ? stall.code : String(stableBlock).trim();
  const occupied = await StableAssignment.findOne({ $or: [{ stableBlock: block }, ...(stall ? [{ stall: stall._id }] : [])], horse: { $ne: horse } }).populate('horse', 'name');
  if (occupied) return fail(res, `Chuồng "${block}" đang có ngựa ${occupied.horse?.name || 'khác'}.`, 409);

  if (assignedCaretaker) {
    const groom = await User.exists({ _id: assignedCaretaker, role: ROLES.GROOM, isActive: true });
    if (!groom) return fail(res, 'Người chăm sóc phải là nhân viên chăm sóc đang hoạt động.', 400);
  }

  const previous = await StableAssignment.findOne({ horse }).select('assignedCaretaker');
  const assignment = await StableAssignment.findOneAndUpdate(
    { horse },
    { horse, stableBlock: block, stall: stall ? stall._id : null, assignedCaretaker: assignedCaretaker || null },
    { new: true, upsert: true, runValidators: true }
  );

  const changedCaretaker = String(previous?.assignedCaretaker || '') !== String(assignment.assignedCaretaker || '');
  if (changedCaretaker && previous?.assignedCaretaker && assignment.assignedCaretaker) {
    // Only unfinished automatic work (feeds, post-session care) moves with the horse; tasks the
    // trainer handed to a specific person by hand stay where they were put.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await DailyTask.updateMany(
      {
        horse,
        assignedTo: previous.assignedCaretaker,
        status: 'pending',
        scheduledDate: { $gte: today },
        $or: [{ taskType: 'feeding' }, { trainingSession: { $ne: null } }, { treatment: { $ne: null } }],
      },
      { assignedTo: assignment.assignedCaretaker }
    );
  }
  if (assignment.assignedCaretaker) {
    await ensureFeedingTasks({ horseIds: [horse] });
    // A horse already under treatment brings its care orders to whoever now looks after it.
    const treatments = await Treatment.find({ horse, status: 'ongoing' });
    for (const treatment of treatments) {
      // eslint-disable-next-line no-await-in-loop
      await syncCareTasks(treatment);
    }
    if (changedCaretaker) {
      const horseDoc = await Horse.findById(horse).select('name');
      await pushNotification({
        recipientUser: assignment.assignedCaretaker,
        horse,
        type: 'task_assigned',
        severity: 'info',
        message: `🐴 Bạn được phân công chăm sóc ${horseDoc?.name || 'ngựa'} tại ${block}. Việc hàng ngày của ngựa đã có trong danh sách của bạn.`,
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
