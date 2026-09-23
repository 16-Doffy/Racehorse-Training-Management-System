const InjuryMarker = require('../../models/InjuryMarker');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');

// Scaffold: markers are stored as normalized 2D coordinates against a reference silhouette.
// A future phase can swap the frontend viewer for an actual 3D musculoskeletal model without
// changing this contract.
const listMarkers = asyncHandler(async (req, res) => {
  const { horse } = req.query;
  const filter = horse ? { horse } : {};
  const markers = await InjuryMarker.find(filter).sort({ createdAt: -1 });
  return ok(res, markers, 'Injury markers fetched.');
});

const createMarker = asyncHandler(async (req, res) => {
  const marker = await InjuryMarker.create({ ...req.body, markedBy: req.user._id });
  return created(res, marker, 'Injury marker created.');
});

const updateMarker = asyncHandler(async (req, res) => {
  const marker = await InjuryMarker.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!marker) return fail(res, 'Injury marker not found.', 404);
  return ok(res, marker, 'Injury marker updated.');
});

// A marker placed on the wrong body part had no way to be removed — only edited — which left the
// horse's injury map permanently wrong if the mistake wasn't caught before saving.
const deleteMarker = asyncHandler(async (req, res) => {
  const marker = await InjuryMarker.findByIdAndDelete(req.params.id);
  if (!marker) return fail(res, 'Injury marker not found.', 404);
  return ok(res, null, 'Injury marker deleted.');
});

module.exports = { listMarkers, createMarker, updateMarker, deleteMarker };
