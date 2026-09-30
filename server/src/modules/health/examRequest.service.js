const ExamRequest = require('../../models/ExamRequest');
const { notifyHorseStaff } = require('../alerts/notification.service');
const { logAction } = require('../audit/audit.service');

const PRIORITY_LABELS = { normal: '', high: ' [ƯU TIÊN CAO]', urgent: ' [KHẨN CẤP]' };

/**
 * Creates an exam request and announces it to the horse's vet (every vet if none is assigned).
 * Shared by the trainer's "ask the vet" button and by requests the system raises itself.
 *
 * `horse` needs `_id` and `name`. `message` overrides the default wording.
 */
async function openExamRequest({ horse, requestedBy, reason, priority = 'normal', trainingSession, message }) {
  const request = await ExamRequest.create({
    horse: horse._id,
    requestedBy: requestedBy._id,
    reason,
    priority,
    trainingSession: trainingSession || null,
  });

  await notifyHorseStaff({
    staff: 'vet',
    horse: horse._id,
    trainingSession: trainingSession || undefined,
    type: 'exam_request',
    severity: priority === 'normal' ? 'warning' : 'critical',
    message:
      message ||
      `🩺${PRIORITY_LABELS[priority]} ${requestedBy.name} yêu cầu kiểm tra sức khỏe cho ${horse.name}${reason ? `: ${reason}` : '.'}`,
  });

  await logAction({
    actorId: requestedBy._id,
    action: trainingSession ? 'healthRecord.request_exam_auto' : 'healthRecord.request_exam',
    targetModel: 'ExamRequest',
    targetId: request._id,
    metadata: { reason, priority },
  });

  return request;
}

module.exports = { openExamRequest, PRIORITY_LABELS };
