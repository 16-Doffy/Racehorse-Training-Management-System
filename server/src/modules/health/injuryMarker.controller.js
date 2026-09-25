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
 * Recomputes a horse's healthStatus after its injury markers change.
 *
 * Two sources write this field: the Veterinarian's examination record — an explicit clinical
 * judgement, written in healthRecord.controller.js — and the markers, which are derived. The rule
 * between them is that markers may only ever raise the alarm, never lower it below what the vet
 * concluded. Without that, clearing a minor marker would quietly downgrade (or fully clear) a horse
 * the vet diagnosed as injured, and training would silently become schedulable again.
 */
async function syncHorseHealthStatus(horseId) {
  if (!horseId) return;

  const horse = await Horse.findById(horseId);
  if (!horse) return;

  // Quarantine is an administrative decision, not something injury markers can express.
  if (horse.healthStatus === 'quarantined') return;

  const [activeMarkers, latestRecord, lockedTreatment] = await Promise.all([
    InjuryMarker.find({ horse: horseId, recoveryStatus: { $ne: 'recovered' } }),
    HealthRecord.findOne({ horse: horseId }).sort({ date: -1, createdAt: -1 }),
    Treatment.findOne({ horse: horseId, isTrainingLocked: true, status: 'ongoing' }),
  ]);

  let target = 'eligible';
  if (activeMarkers.length > 0) {
    target = activeMarkers.some((m) => m.severity === 'severe') ? 'injured' : 'monitoring';
  }

  // The vet's own conclusion is a floor the markers can't undercut.
  const clinical = latestRecord?.resultStatus;
  if (clinical && STATUS_RANK[clinical] > STATUS_RANK[target]) target = clinical;

  // An active training lock means the horse is not cleared yet, whatever the markers say.
  if (lockedTreatment && STATUS_RANK[horse.healthStatus] > STATUS_RANK[target]) return;

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

module.exports = { listMarkers, createMarker, updateMarker, deleteMarker };
