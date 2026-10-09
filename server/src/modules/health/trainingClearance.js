const Treatment = require('../../models/Treatment');
const HealthRecord = require('../../models/HealthRecord');

/**
 * How hard a horse may be worked while it is being treated — set by the vet on each treatment.
 *
 *   none     — no training at all (the "training lock")
 *   light    — recovering: light work only
 *   moderate — recovering: up to moderate intensity
 *   high     — no restriction
 *
 * The vet raises the level step by step as the horse recovers (none → light → moderate). Three things
 * restrict a horse, and the strictest applies:
 *   - an ongoing treatment's level;
 *   - a treatment that ended while it still restricted training, until a vet assesses the horse for a
 *     return to training (ending the treatment is not the same as being cleared);
 *   - the newest return assessment (a HealthRecord with clearedLevel), until a later one raises it.
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

const when = (x) => new Date(x.date || x.createdAt || 0).getTime();

function clearanceFrom(treatments, ended = [], assessments = []) {
  const candidates = treatments.map((t) => ({
    level: levelOf(t),
    source: 'treatment',
    reason: t.lockReason || null,
    treatment: t._id,
    since: t.startDate || t.createdAt,
    prescribedBy: t.prescribedBy?.name || null,
  }));
  const latest = [...assessments].sort((a, b) => when(b) - when(a))[0] || null;
  for (const t of ended) {
    const endedAt = new Date(t.endDate || t.updatedAt || 0).getTime();
    if (latest && when(latest) >= endedAt) continue; // assessed since
    candidates.push({
      level: t.returnLevel,
      source: 'awaiting_return',
      reason: 'Đã kết thúc điều trị — chờ bác sĩ đánh giá cho tập lại',
      treatment: t._id,
      since: t.endDate || t.updatedAt,
      prescribedBy: t.prescribedBy?.name || null,
    });
  }
  if (latest && latest.clearedLevel !== 'high') {
    candidates.push({
      level: latest.clearedLevel,
      source: 'assessment',
      reason: `Bác sĩ đánh giá ngày ${new Date(latest.date || latest.createdAt).toLocaleDateString('vi-VN')}${latest.diagnosis ? `: ${latest.diagnosis}` : ''}`,
      record: latest._id,
      since: latest.date || latest.createdAt,
      prescribedBy: latest.examinedBy?.name || null,
    });
  }
  let strictest = null;
  for (const c of candidates) if (!strictest || LEVEL_RANK[c.level] < LEVEL_RANK[strictest.level]) strictest = c;
  if (!strictest || strictest.level === 'high') return { level: 'high', label: LEVEL_LABELS.high, restricted: false };
  return { ...strictest, label: LEVEL_LABELS[strictest.level], restricted: true };
}

const ONGOING_FIELDS = 'horse trainingLevel isTrainingLocked lockReason status startDate createdAt prescribedBy';

/** The level that applies to one horse right now. */
async function getTrainingClearance(horseId) {
  return (await clearanceMap([horseId])).get(String(horseId));
}

/** The same for many horses in three queries: Map(horseId → clearance). */
async function clearanceMap(horseIds) {
  const [ongoing, ended, assessments] = await Promise.all([
    Treatment.find({ horse: { $in: horseIds }, status: 'ongoing' }).populate('prescribedBy', 'name').select(ONGOING_FIELDS),
    Treatment.find({ horse: { $in: horseIds }, status: { $ne: 'ongoing' }, returnLevel: { $in: ['none', 'light', 'moderate'] } })
      .populate('prescribedBy', 'name')
      .select('horse returnLevel endDate updatedAt prescribedBy'),
    HealthRecord.find({ horse: { $in: horseIds }, clearedLevel: { $in: LEVELS } })
      .populate('examinedBy', 'name')
      .select('horse clearedLevel date createdAt diagnosis examinedBy'),
  ]);
  const group = (rows) => {
    const byHorse = new Map();
    for (const r of rows) {
      const key = String(r.horse);
      if (!byHorse.has(key)) byHorse.set(key, []);
      byHorse.get(key).push(r);
    }
    return byHorse;
  };
  const [o, e, a] = [group(ongoing), group(ended), group(assessments)];
  return new Map(horseIds.map((id) => [String(id), clearanceFrom(o.get(String(id)) || [], e.get(String(id)) || [], a.get(String(id)) || [])]));
}

/** Whether a session of this intensity is allowed under a clearance. */
const allows = (clearance, intensity) => !intensity || (INTENSITY_RANK[intensity] || 0) <= LEVEL_RANK[clearance.level];

module.exports = { LEVELS, LEVEL_RANK, INTENSITY_RANK, LEVEL_LABELS, levelOf, clearanceFrom, getTrainingClearance, clearanceMap, allows };
