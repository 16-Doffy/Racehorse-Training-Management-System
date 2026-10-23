const mongoose = require('mongoose');
const User = require('../../models/User');
const Stall = require('../../models/Stall');
const StableAssignment = require('../../models/StableAssignment');
const DailyTask = require('../../models/DailyTask');
const { ROLES } = require('../../constants/roles');

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * What a groom is holding: the stalls they are the groom of, the horses they look after, and their
 * unfinished tasks from today on. Locking the account (or moving it to another role) with any of
 * these would leave horses unfed and stalls with nobody: the Manager names a replacement first.
 */
async function groomWork(userId) {
  const stalls = await Stall.find({ caretaker: userId, isActive: true }).select('code').sort({ code: 1 });
  const assignments = await StableAssignment.find({ assignedCaretaker: userId }).populate('horse', 'name').select('horse');
  const pendingTasks = await DailyTask.countDocuments({ assignedTo: userId, status: 'pending', scheduledDate: { $gte: startOfToday() } });
  return {
    stalls: stalls.map((s) => s.code),
    horses: assignments.map((a) => a.horse?.name).filter(Boolean),
    horseIds: assignments.map((a) => a.horse?._id || a.horse).filter(Boolean),
    pendingTasks,
    held: stalls.length + assignments.length + pendingTasks > 0,
  };
}

/** Why `replacementId` cannot take over from `user`, or null. */
async function replacementProblem(user, replacementId) {
  const message = 'Người thay phải là một nhân viên chăm sóc khác đang hoạt động.';
  if (!mongoose.isValidObjectId(replacementId) || String(replacementId) === String(user._id)) return message;
  return (await User.exists({ _id: replacementId, role: ROLES.GROOM, isActive: true })) ? null : message;
}

/**
 * Gives everything a groom holds to `to`, inside the caller's transaction: the stalls they are the
 * groom of, the horses they look after, and every unfinished task from today on — the ones handed out
 * by hand too, since nobody else would do them once the account is locked. Earlier tasks stay as the
 * record of what was missed.
 */
async function handOverGroomWork({ from, to, session }) {
  const stalls = await Stall.updateMany({ caretaker: from }, { caretaker: to }, { session });
  const horses = await StableAssignment.updateMany({ assignedCaretaker: from }, { assignedCaretaker: to }, { session });
  const tasks = await DailyTask.updateMany({ assignedTo: from, status: 'pending', scheduledDate: { $gte: startOfToday() } }, { assignedTo: to }, { session });
  return { stalls: stalls.modifiedCount, horses: horses.modifiedCount, tasks: tasks.modifiedCount };
}

module.exports = { groomWork, replacementProblem, handOverGroomWork };
