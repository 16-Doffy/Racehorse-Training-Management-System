const Treatment = require('../../models/Treatment');

/**
 * How hard a horse may be worked while it is being treated — set by the vet on each treatment.
 *
 *   none     — no training at all (the "training lock")
 *   light    — recovering: light work only
 *   moderate — recovering: up to moderate intensity
 *   high     — no restriction
 *
 * The vet raises the level step by step as the horse recovers (none → light → moderate); a treatment
 * that is completed no longer restricts anything, which is what "fully recovered" means. With
 * several ongoing treatments the strictest one applies.
 */

const LEVELS = ['none', 'light', 'moderate', 'high'];
const LEVEL_RANK = { none: 0, light: 1, moderate: 2, high: 3 };
const INTENSITY_RANK = { light: 1, moderate: 2, high: 3 };
const LEVEL_LABELS = {
  none: 'không được tập',
  light: 'tập nhẹ',
  moderate: 'tập tối đa cường độ vừa',
  high: 'tập bình thường',
};

/** A treatment's level; records from before the level existed only have the lock flag. */
function levelOf(treatment) {
  if (!treatment || treatment.status !== 'ongoing') return 'high';
  if (LEVELS.includes(treatment.trainingLevel)) return treatment.trainingLevel;
  return treatment.isTrainingLocked ? 'none' : 'high';
}

function clearanceFrom(treatments) {
  let strictest = null;
  for (const t of treatments) {
    if (!strictest || LEVEL_RANK[levelOf(t)] < LEVEL_RANK[levelOf(strictest)]) strictest = t;
  }
  const level = strictest ? levelOf(strictest) : 'high';
  if (level === 'high') return { level: 'high', label: LEVEL_LABELS.high, restricted: false };
  return {
    level,
    label: LEVEL_LABELS[level],
    restricted: true,
    reason: strictest.lockReason || null,
    treatment: strictest._id,
    since: strictest.startDate || strictest.createdAt,
    prescribedBy: strictest.prescribedBy?.name || null,
  };
}

const ONGOING_FIELDS = 'horse trainingLevel isTrainingLocked lockReason status startDate createdAt prescribedBy';

/** The level that applies to one horse right now. */
async function getTrainingClearance(horseId) {
  const ongoing = await Treatment.find({ horse: horseId, status: 'ongoing' }).populate('prescribedBy', 'name').select(ONGOING_FIELDS);
  return clearanceFrom(ongoing);
}

/** The same for many horses in one query: Map(horseId → clearance). */
async function clearanceMap(horseIds) {
  const ongoing = await Treatment.find({ horse: { $in: horseIds }, status: 'ongoing' }).populate('prescribedBy', 'name').select(ONGOING_FIELDS);
  const byHorse = new Map();
  for (const t of ongoing) {
    const key = String(t.horse);
    if (!byHorse.has(key)) byHorse.set(key, []);
    byHorse.get(key).push(t);
  }
  return new Map(horseIds.map((id) => [String(id), clearanceFrom(byHorse.get(String(id)) || [])]));
}

/** Whether a session of this intensity is allowed under a clearance. */
const allows = (clearance, intensity) => !intensity || (INTENSITY_RANK[intensity] || 0) <= LEVEL_RANK[clearance.level];

module.exports = { LEVELS, LEVEL_RANK, INTENSITY_RANK, LEVEL_LABELS, levelOf, getTrainingClearance, clearanceMap, allows };
