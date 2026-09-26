const StableAssignment = require('../../models/StableAssignment');
const DailyTask = require('../../models/DailyTask');
const User = require('../../models/User');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const { ROLES } = require('../../constants/roles');
const { ensureFeedingTasks } = require('../../realtime/dailyTaskGenerator');

const listAssignments = asyncHandler(async (req, res) => {
  const assignments = await StableAssignment.find()
    .populate('horse', 'name healthStatus')
    .populate('assignedCaretaker', 'name')
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
  if (!horse || !stableBlock) return fail(res, 'horse và stableBlock là bắt buộc.', 400);
  if (!(await canAccessHorse(req.user, horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const block = String(stableBlock).trim();
  const occupied = await StableAssignment.findOne({ stableBlock: block, horse: { $ne: horse } }).populate('horse', 'name');
  if (occupied) return fail(res, `Chuồng "${block}" đang có ngựa ${occupied.horse?.name || 'khác'}.`, 409);

  if (assignedCaretaker) {
    const groom = await User.exists({ _id: assignedCaretaker, role: ROLES.GROOM, isActive: true });
    if (!groom) return fail(res, 'Người chăm sóc phải là nhân viên chăm sóc đang hoạt động.', 400);
  }

  const previous = await StableAssignment.findOne({ horse }).select('assignedCaretaker');
  const assignment = await StableAssignment.findOneAndUpdate(
    { horse },
    { horse, stableBlock: block, assignedCaretaker: assignedCaretaker || null },
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
        $or: [{ taskType: 'feeding' }, { trainingSession: { $ne: null } }],
      },
      { assignedTo: assignment.assignedCaretaker }
    );
  }
  if (assignment.assignedCaretaker) await ensureFeedingTasks({ horseIds: [horse], onlyUpcoming: true });

  await logAction({
    actorId: req.user._id,
    action: 'stableAssignment.save',
    targetModel: 'StableAssignment',
    targetId: assignment._id,
    metadata: { stableBlock: block, caretakerChanged: changedCaretaker },
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
