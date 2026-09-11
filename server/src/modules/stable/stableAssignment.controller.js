const StableAssignment = require('../../models/StableAssignment');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');

const listAssignments = asyncHandler(async (req, res) => {
  const assignments = await StableAssignment.find()
    .populate('horse', 'name')
    .populate('assignedCaretaker', 'name')
    .sort({ stableBlock: 1 });
  return ok(res, assignments, 'Stable assignments fetched.');
});

const upsertAssignment = asyncHandler(async (req, res) => {
  const { horse } = req.body;
  const assignment = await StableAssignment.findOneAndUpdate({ horse }, req.body, {
    new: true,
    upsert: true,
    runValidators: true,
  });
  return created(res, assignment, 'Stable assignment saved.');
});

const deleteAssignment = asyncHandler(async (req, res) => {
  const assignment = await StableAssignment.findByIdAndDelete(req.params.id);
  if (!assignment) return fail(res, 'Assignment not found.', 404);
  return ok(res, null, 'Stable assignment removed.');
});

module.exports = { listAssignments, upsertAssignment, deleteAssignment };
