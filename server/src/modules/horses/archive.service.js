const Horse = require('../../models/Horse');
const ExamRequest = require('../../models/ExamRequest');
const Treatment = require('../../models/Treatment');
const DailyTask = require('../../models/DailyTask');
const { unresolvedIncidentFilter } = require('../stable/incident.service');

/**
 * What a horse the club no longer manages must not leave open on anyone's screen: an exam request
 * still waiting for the vet, a course of treatment still "ongoing" (with its care orders and its
 * training restriction), an incident report nobody will answer. Closed with the reason, kept as
 * history. Returns how many of each were closed. Safe to run again.
 */
async function closeLeftoversFor(horse, reason = horse.archivedReason || 'ngừng quản lý') {
  const why = `Ngựa đã ngừng quản lý: ${reason}`;
  const [exams, treatments] = await Promise.all([
    ExamRequest.updateMany({ horse: horse._id, status: 'pending' }, { status: 'cancelled' }),
    Treatment.updateMany({ horse: horse._id, status: 'ongoing' }, { status: 'completed', endDate: new Date() }),
  ]);
  const incidents = await DailyTask.updateMany(
    { horse: horse._id, ...unresolvedIncidentFilter() },
    { 'incidentReport.status': 'resolved', 'incidentReport.resolvedAt': new Date(), 'incidentReport.response': why }
  );
  // Older archives may still carry pending work. Close it without erasing the observations or
  // reports attached to it; the groom's active list filters by pending status.
  await DailyTask.updateMany({ horse: horse._id, status: 'pending' }, { status: 'skipped', skipReason: why });
  return { exams: exams.modifiedCount, treatments: treatments.modifiedCount, incidents: incidents.modifiedCount };
}

/**
 * The same for every archived horse — horses archived before this existed still had pending exam
 * requests and ongoing treatments. Run with the hourly jobs.
 */
async function closeArchivedLeftovers() {
  const horses = await Horse.find({ isArchived: true }).select('_id archivedReason');
  const total = { exams: 0, treatments: 0, incidents: 0 };
  for (const horse of horses) {
    // eslint-disable-next-line no-await-in-loop
    const closed = await closeLeftoversFor(horse);
    for (const k of Object.keys(total)) total[k] += closed[k];
  }
  return total;
}

module.exports = { closeLeftoversFor, closeArchivedLeftovers };
