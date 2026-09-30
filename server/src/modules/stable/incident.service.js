const DailyTask = require('../../models/DailyTask');
const Horse = require('../../models/Horse');
const { pushNotification, notifyHorseStaff } = require('../alerts/notification.service');

// How long an unanswered report keeps counting against a horse's readiness. Reports from before
// incidents had a status carry no "resolved" mark, so without a window every horse that ever had
// one would be flagged forever.
const OPEN_INCIDENT_WINDOW_DAYS = 3;

const INCIDENT_STATUS_LABELS = { open: 'chưa xử lý', acknowledged: 'bác sĩ đã tiếp nhận', resolved: 'đã xử lý' };

/** Mongo filter for tasks carrying a report the vet has not closed. Old reports have no status. */
function unresolvedIncidentFilter() {
  return {
    'incidentReport.description': { $exists: true },
    'incidentReport.status': { $ne: 'resolved' },
  };
}

/**
 * The most serious report on this horse that a vet hasn't closed, if it is recent and serious
 * enough to matter to a training decision (medium or high). Used by the readiness board.
 */
async function findOpenIncident(horseId) {
  const since = new Date(Date.now() - OPEN_INCIDENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const tasks = await DailyTask.find({
    horse: horseId,
    ...unresolvedIncidentFilter(),
    'incidentReport.severity': { $in: ['medium', 'high'] },
    'incidentReport.reportedAt': { $gte: since },
  })
    .sort({ 'incidentReport.reportedAt': -1 })
    .select('incidentReport');
  if (tasks.length === 0) return null;
  return (tasks.find((t) => t.incidentReport.severity === 'high') || tasks[0]).incidentReport;
}

/**
 * Tells the people waiting on an incident what the vet did with it: the groom who reported it
 * (they are the one standing next to the horse) and the horse's trainer.
 */
async function announceIncidentUpdate(task, { vetName, horseName }) {
  const report = task.incidentReport;
  const message = `🩺 Bác sĩ ${vetName} ${report.status === 'resolved' ? 'đã xử lý' : 'đã tiếp nhận'} sự cố của ${horseName}${
    report.response ? `: ${report.response}` : '.'
  }`;
  const payload = { horse: task.horse, type: 'incident_update', severity: 'info', message };
  await pushNotification({ ...payload, recipientUser: task.assignedTo });
  await notifyHorseStaff({ ...payload, staff: 'trainer' });
}

/**
 * Filing an exam answers every report still open for that horse — the vet has now looked at it.
 * Same idea as exam requests closing themselves (health/examRequest.service.js).
 */
async function resolveIncidentsWithRecord(record, vet) {
  const open = await DailyTask.find({ horse: record.horse, ...unresolvedIncidentFilter() });
  if (open.length === 0) return 0;

  const horse = await Horse.findById(record.horse).select('name');
  for (const task of open) {
    Object.assign(task.incidentReport, {
      status: 'resolved',
      handledBy: vet._id,
      resolvedAt: new Date(),
      healthRecord: record._id,
      response: `Đã khám — ${record.diagnosis}`,
    });
    // eslint-disable-next-line no-await-in-loop
    await task.save();
  }

  // One message per person, however many reports were closed.
  const newest = open.reduce((a, b) => (a.incidentReport.reportedAt > b.incidentReport.reportedAt ? a : b));
  const grooms = [...new Set(open.map((t) => String(t.assignedTo)))];
  const message = `🩺 Bác sĩ ${vet.name} đã khám ${horse?.name || 'ngựa'} sau sự cố được báo — ${record.diagnosis}`;
  for (const groomId of grooms) {
    // eslint-disable-next-line no-await-in-loop
    await pushNotification({ recipientUser: groomId, horse: record.horse, type: 'incident_update', severity: 'info', message });
  }
  await notifyHorseStaff({ staff: 'trainer', horse: newest.horse, type: 'incident_update', severity: 'info', message });
  return open.length;
}

module.exports = {
  OPEN_INCIDENT_WINDOW_DAYS,
  INCIDENT_STATUS_LABELS,
  unresolvedIncidentFilter,
  findOpenIncident,
  announceIncidentUpdate,
  resolveIncidentsWithRecord,
};
