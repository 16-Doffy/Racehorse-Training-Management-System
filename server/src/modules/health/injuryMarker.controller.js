const InjuryMarker = require('../../models/InjuryMarker');
const Horse = require('../../models/Horse');
const Treatment = require('../../models/Treatment');
const HealthRecord = require('../../models/HealthRecord');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');

// How serious each status is. healthStatus gates whether training may be scheduled
// (trainingSession.controller.js), so "how far from fit to train" is the only ordering that
// matters here.
const STATUS_RANK = { eligible: 0, monitoring: 1, injured: 2, quarantined: 3 };

/**
 * Recomputes a horse's healthStatus after its injury markers change, or after a lock is lifted.
 *
 * While active markers remain, they set the status and the vet's latest diagnosis acts as a floor.
 * Once every marker is resolved the horse returns to eligible — unless a training lock is still in
 * force. A lock is a separate, explicit order that may have nothing to do with the markers (a
 * fever, colic), so resolving markers must never undo it, and lifting a lock stays an explicit,
 * audited action through setTrainingLock rather than a side effect of editing the injury map.
 */
async function syncHorseHealthStatus(horseId) {
  if (!horseId) return;

  const horse = await Horse.findById(horseId);
  if (!horse) return;

  // Quarantine is an administrative decision, not something injury markers can express.
  if (horse.healthStatus === 'quarantined') return;

  const activeMarkers = await InjuryMarker.find({ horse: horseId, recoveryStatus: { $ne: 'recovered' } });

  let target = 'eligible';

  if (activeMarkers.length > 0) {
    target = activeMarkers.some((m) => m.severity === 'severe') ? 'injured' : 'monitoring';

    // The vet's own conclusion is a floor only while active markers remain.
    const latestRecord = await HealthRecord.findOne({ horse: horseId }).sort({ date: -1, createdAt: -1 });
    const clinical = latestRecord?.resultStatus;
    if (clinical && clinical !== 'quarantined' && STATUS_RANK[clinical] > STATUS_RANK[target]) {
      target = clinical;
    }
  }

  // Marker changes can raise the alarm freely, but may not lower it while a lock is in force:
  // deleting a mis-placed scratch must not clear a horse the vet grounded for a fever. This used to
  // lift every lock on the horse with an updateMany — unrelated locks included, with no audit entry
  // and no word to the trainer — which also meant lifting one of two locks silently lifted both.
  const lockedTreatment = await Treatment.findOne({ horse: horseId, isTrainingLocked: true, status: 'ongoing' });
  if (lockedTreatment && STATUS_RANK[target] < STATUS_RANK[horse.healthStatus]) return;

  if (target !== horse.healthStatus) {
    horse.healthStatus = target;
    await horse.save();
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

module.exports = { listMarkers, createMarker, updateMarker, deleteMarker, syncHorseHealthStatus };
