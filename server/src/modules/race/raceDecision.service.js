const RaceEntry = require('../../models/RaceEntry');
const Horse = require('../../models/Horse');
const TrainingSession = require('../../models/TrainingSession');
const { notifyHorseStaff } = require('../alerts/notification.service');

const DONE = ['completed', 'evaluated'];

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * The trial runs that count as evidence for an entry: linked to that entry (not merely the same horse
 * around the same dates, which mixes up two races close together), of the same horse, and actually run.
 * Newest first.
 */
async function trialsForEntry(entry) {
  return TrainingSession.find({ raceEntry: entry._id, horse: entry.horse, status: { $in: DONE } })
    .select('scheduledAt status outcome metrics actualStartAt actualEndAt videoUrl performanceRating')
    .sort({ scheduledAt: -1 });
}

/**
 * The horse's health changed after it was confirmed for a race (an exam that wasn't "eligible", a lock
 * or a lower training level, an incident, a fever at the pre-check, a run stopped for its health).
 * Confirmed entries still ahead are marked for review and the trainer is told; withdrawing stays the
 * trainer's call. A new decision clears the mark. Never throws: the change that caused it must stand.
 */
async function flagConfirmedEntries(horseId, reason) {
  try {
    const entries = await RaceEntry.find({ horse: horseId, status: 'confirmed', raceDate: { $gte: startOfToday() } }).select('raceName raceDate');
    if (!entries.length) return 0;
    await RaceEntry.updateMany(
      { _id: { $in: entries.map((e) => e._id) } },
      { $set: { reviewNeeded: true, reviewReason: reason, reviewFlaggedAt: new Date() } }
    );
    const horse = await Horse.findById(horseId).select('name');
    const list = entries.map((e) => `${e.raceName} (${new Date(e.raceDate).toLocaleDateString('vi-VN')})`).join(', ');
    await notifyHorseStaff({
      staff: 'trainer',
      horse: horseId,
      type: 'race_review',
      severity: 'warning',
      message: `⚠️ ${horse?.name || 'Ngựa'} đã được xác nhận dự ${list}, nhưng sức khỏe vừa thay đổi: ${reason}. Hãy xem lại quyết định dự giải.`,
    });
    return entries.length;
  } catch (err) {
    console.error('[race-review] flag failed:', err.message);
    return 0;
  }
}

module.exports = { trialsForEntry, flagConfirmedEntries, startOfToday };
