const ExamRequest = require('../../models/ExamRequest');
const { notifyHorseStaff } = require('../alerts/notification.service');
const { logAction } = require('../audit/audit.service');
const { BODY_AREAS, EXAM_SYMPTOMS, dueByOf, fmtWhen } = require('../../constants/examRequest');

const PRIORITY_LABELS = { normal: '', high: ' [ƯU TIÊN CAO]', urgent: ' [KHẨN CẤP]' };

/** "khập khiễng, sưng nóng ở chân (chân trước trái)" from the keys the requester ticked. */
function signsText(symptoms = [], bodyAreas = []) {
  const signs = symptoms.map((k) => EXAM_SYMPTOMS[k]?.toLowerCase()).filter(Boolean).join(', ');
  const areas = bodyAreas.map((k) => BODY_AREAS[k]?.toLowerCase()).filter(Boolean).join(', ');
  if (signs && areas) return `${signs} (${areas})`;
  return signs || areas;
}

/**
 * Creates an exam request and announces it to the horse's vet (every vet if none is assigned).
 * Shared by the trainer's "ask the vet" form and by requests the system raises itself.
 *
 * `horse` needs `_id` and `name`. `message` overrides the default wording. The deadline (dueBy) comes
 * from the priority. `auto`: raised by the system from a session's numbers (the default whenever a
 * session is given), not typed by a person who picked that session.
 */
async function openExamRequest({
  horse,
  requestedBy,
  reason,
  priority = 'normal',
  trainingSession,
  auto = Boolean(trainingSession),
  symptoms = [],
  bodyAreas = [],
  observedAt = null,
  firstAid,
  holdTraining = false,
  message,
}) {
  const now = new Date();
  const dueBy = dueByOf(priority, now);
  const request = await ExamRequest.create({
    horse: horse._id,
    requestedBy: requestedBy._id,
    reason,
    priority,
    symptoms,
    bodyAreas,
    observedAt,
    firstAid,
    holdTraining,
    dueBy,
    trainingSession: trainingSession || null,
    auto,
  });

  const signs = signsText(symptoms, bodyAreas);
  const details = [signs && `${signs.charAt(0).toUpperCase()}${signs.slice(1)}.`, reason && `${reason.replace(/[.\s]+$/, '')}.`, holdTraining && 'HLV đã dừng tập chờ khám.']
    .filter(Boolean)
    .join(' ');
  await notifyHorseStaff({
    staff: 'vet',
    horse: horse._id,
    trainingSession: trainingSession || undefined,
    type: 'exam_request',
    severity: priority === 'normal' ? 'warning' : 'critical',
    message:
      message ||
      `🩺${PRIORITY_LABELS[priority]} ${requestedBy.name} yêu cầu khám ${horse.name}${details ? `: ${details}` : '.'} Cần khám trước ${fmtWhen(dueBy)}.`,
  });

  await logAction({
    actorId: requestedBy._id,
    action: auto ? 'healthRecord.request_exam_auto' : 'healthRecord.request_exam',
    targetModel: 'ExamRequest',
    targetId: request._id,
    metadata: { reason, priority, symptoms, holdTraining },
  });

  return request;
}

module.exports = { openExamRequest, signsText, PRIORITY_LABELS };
