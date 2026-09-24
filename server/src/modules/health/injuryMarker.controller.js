const InjuryMarker = require('../../models/InjuryMarker');
const Horse = require('../../models/Horse');
const Treatment = require('../../models/Treatment');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');

/**
 * Automatically syncs a horse's healthStatus based on active injury markers and training locks.
 */
async function syncHorseHealthStatus(horseId) {
  if (!horseId) return;

  const horse = await Horse.findById(horseId);
  if (!horse) return;

  const activeMarkers = await InjuryMarker.find({
    horse: horseId,
    recoveryStatus: { $ne: 'recovered' },
  });

  const lockedTreatment = await Treatment.findOne({
    horse: horseId,
    isTrainingLocked: true,
    status: 'ongoing',
  });

  if (activeMarkers.length > 0) {
    const hasSevere = activeMarkers.some((m) => m.severity === 'severe');
    const newStatus = hasSevere ? 'injured' : 'monitoring';
    if (horse.healthStatus !== newStatus && horse.healthStatus !== 'quarantined') {
      horse.healthStatus = newStatus;
      await horse.save();
    }
  } else if (!lockedTreatment) {
    if (horse.healthStatus === 'injured' || horse.healthStatus === 'monitoring') {
      horse.healthStatus = 'eligible';
      await horse.save();
    }
  }
}

const listMarkers = asyncHandler(async (req, res) => {
  const { horse } = req.query;
  const filter = horse ? { horse } : {};
  const markers = await InjuryMarker.find(filter).sort({ createdAt: -1 });
  return ok(res, markers, 'Injury markers fetched.');
});

const createMarker = asyncHandler(async (req, res) => {
  const marker = await InjuryMarker.create({ ...req.body, markedBy: req.user._id });
  if (marker.horse) {
    await syncHorseHealthStatus(marker.horse);
  }
  return created(res, marker, 'Injury marker created.');
});

const updateMarker = asyncHandler(async (req, res) => {
  const marker = await InjuryMarker.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!marker) return fail(res, 'Injury marker not found.', 404);
  if (marker.horse) {
    await syncHorseHealthStatus(marker.horse);
  }
  return ok(res, marker, 'Injury marker updated.');
});

// A marker placed on the wrong body part had no way to be removed — only edited — which left the
// horse's injury map permanently wrong if the mistake wasn't caught before saving.
// Deleting a mis-marked injury marker automatically recalculates the horse's health status.
const deleteMarker = asyncHandler(async (req, res) => {
  const marker = await InjuryMarker.findByIdAndDelete(req.params.id);
  if (!marker) return fail(res, 'Injury marker not found.', 404);
  if (marker.horse) {
    await syncHorseHealthStatus(marker.horse);
  }
  return ok(res, null, 'Injury marker deleted.');
});

module.exports = { listMarkers, createMarker, updateMarker, deleteMarker };
