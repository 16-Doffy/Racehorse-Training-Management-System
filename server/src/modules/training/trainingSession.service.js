const TrainingSession = require('../../models/TrainingSession');
const Horse = require('../../models/Horse');
const User = require('../../models/User');
const DailyTask = require('../../models/DailyTask');
const StableAssignment = require('../../models/StableAssignment');
const ExamRequest = require('../../models/ExamRequest');
const { logAction } = require('../audit/audit.service');
const { pushNotification, notifyCaretaker } = require('../alerts/notification.service');
const { openExamRequest } = require('../health/examRequest.service');
const { MIN_DIGEST_MINUTES } = require('./readiness.service');
const { OBJECTIVE_LABELS, SESSION_KINDS } = require('../../constants/training');

/*
 * What happens around a training session that more than the HTTP routes need: judging it against
 * its prescription, the work and notifications that follow it finishing, and building a session's
 * content from a kind of work. The sensor simulator finishes sessions on its own, so this can't
 * live inside the controller.
 */

/**
 * Did the session do what it set out to do? Compares what was actually measured against what was
 * prescribed. Returns `met: null` when the session had no targets — an honest "no verdict" rather
 * than a misleading pass.
 */
function computeOutcome(session) {
  const p = session.prescription || {};
  const m = session.metrics || {};
  const checks = [];

  if (p.targetSpeedKmh != null && m.maxSpeed != null) {
    checks.push({ ok: m.maxSpeed >= p.targetSpeedKmh, text: `tốc độ ${m.maxSpeed}/${p.targetSpeedKmh} km/h` });
  }
  if (p.targetHeartRateMax != null && m.avgHeartRate != null) {
    checks.push({ ok: m.avgHeartRate <= p.targetHeartRateMax, text: `nhịp tim ${m.avgHeartRate}/${p.targetHeartRateMax} bpm` });
  }
  if (p.distanceM != null && m.distance != null) {
    checks.push({ ok: m.distance >= p.distanceM, text: `cự ly ${m.distance}/${p.distanceM} m` });
  }

  if (checks.length === 0) return { met: null, summary: '' };

  const met = checks.every((c) => c.ok);
  return { met, summary: `${met ? 'Đạt mục tiêu' : 'Chưa đạt mục tiêu'} — ${checks.map((c) => c.text).join(', ')}.` };
}

// Average heart rate this far past the session's own ceiling is no longer "worked hard" but
// "something may be wrong" — worth a vet's look even if the trainer doesn't ask for one.
const OVEREXERTION_RATIO = 1.1;
// A session only concerns the groom's day once it is this close.
const ANNOUNCE_WITHIN_HOURS = 24;

const clock = (date) => new Date(date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/**
 * Tells the horse's groom a session is coming and when the horse has to have finished eating.
 * The trainer's readiness board warns about a meal too close to the work, but the person who can
 * actually move the meal is the groom, who until now was never told a session existed.
 */
async function announceSessionToGroom(session, horseName) {
  if (session.status !== 'scheduled') return;
  const at = new Date(session.scheduledAt);
  const hoursAway = (at.getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursAway < 0 || hoursAway > ANNOUNCE_WITHIN_HOURS) return;

  const feedBy = new Date(at.getTime() - MIN_DIGEST_MINUTES * 60 * 1000);
  await notifyCaretaker({
    horse: session.horse,
    trainingSession: session._id,
    type: 'session_scheduled',
    severity: 'info',
    message: `🏇 ${horseName} có buổi tập "${OBJECTIVE_LABELS[session.objective] || 'huấn luyện'}" lúc ${clock(at)} ngày ${at.toLocaleDateString(
      'vi-VN'
    )} — cho ăn xong trước ${clock(feedBy)}.${session.coachNote ? ` HLV dặn: ${session.coachNote}` : ''}`,
  });
}

/**
 * Raises an exam request when the numbers of a finished session say the horse was pushed well past
 * the heart-rate ceiling the trainer set for it. At most one per session, and none while the horse
 * already has a request waiting.
 */
async function raiseExamIfOverexerted(session, user, horse) {
  if (!user) return false;
  const limit = session.prescription?.targetHeartRateMax;
  const measured = session.metrics?.avgHeartRate;
  if (!limit || !measured || measured < limit * OVEREXERTION_RATIO) return false;
  if (await ExamRequest.exists({ $or: [{ trainingSession: session._id }, { horse: session.horse, status: 'pending' }] })) return false;

  const what = OBJECTIVE_LABELS[session.objective] || 'huấn luyện';
  const reason = `Nhịp tim trung bình ${Math.round(measured)} bpm, vượt giới hạn ${limit} bpm của buổi "${what}".`;
  await openExamRequest({
    horse,
    requestedBy: user,
    reason,
    priority: 'high',
    trainingSession: session._id,
    message: `🩺 [ƯU TIÊN CAO] Hệ thống đề nghị khám ${horse.name} sau buổi tập: ${reason}`,
  });
  return true;
}

/**
 * A hard session leaves a horse that needs cooling down and its legs iced, and the person who does
 * that is the groom, not the trainer. Rather than relying on the trainer to remember to assign it,
 * finishing the session creates the work. Idempotent per session.
 */
async function createPostSessionCare(session) {
  const isHard = session.intensity === 'high' || session.objective === 'race_simulation';
  if (!isHard) return 0;

  const assignment = await StableAssignment.findOne({ horse: session.horse });
  if (!assignment?.assignedCaretaker) return 0;

  const what = `${(OBJECTIVE_LABELS[session.objective] || 'buổi tập').toLowerCase()}${
    session.prescription?.distanceM ? ` ${session.prescription.distanceM}m` : ''
  }`;
  const wanted = [
    { taskType: 'icing', note: `Sau buổi ${what} — ngâm chân hạ nhiệt gân.` },
    { taskType: 'bathing', note: `Sau buổi ${what} — tắm và lau khô.` },
  ];

  let createdCount = 0;
  for (const item of wanted) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await DailyTask.exists({ horse: session.horse, taskType: item.taskType, trainingSession: session._id });
    if (exists) continue;

    // eslint-disable-next-line no-await-in-loop
    await DailyTask.create({
      horse: session.horse,
      assignedTo: assignment.assignedCaretaker,
      taskType: item.taskType,
      source: 'system',
      trainingSession: session._id,
      note: item.note,
      scheduledDate: new Date(),
      status: 'pending',
    });
    createdCount += 1;
  }
  if (createdCount > 0) {
    await notifyCaretaker({
      horse: session.horse,
      trainingSession: session._id,
      type: 'task_assigned',
      severity: 'info',
      message: `🧊 Ngựa vừa xong buổi ${what} — có ${createdCount} việc chăm sóc sau tập (ngâm chân, tắm) trong danh sách của bạn.`,
    });
  }
  return createdCount;
}

/** Everything that follows a session reaching "completed" for the first time. */
async function onCompleted(session, user) {
  const careTasksCreated = await createPostSessionCare(session);

  // The owner pays for this horse and never sees the training screens — closing the loop back to
  // them is the difference between "my horse trains somewhere" and knowing how it went.
  const horse = await Horse.findById(session.horse).select('name owner');
  if (horse) await raiseExamIfOverexerted(session, user, horse);
  if (horse?.owner) {
    await pushNotification({
      recipientUser: horse.owner,
      horse: horse._id,
      trainingSession: session._id,
      type: 'session_completed',
      severity: 'info',
      message: `🏇 ${horse.name} đã hoàn thành buổi tập "${OBJECTIVE_LABELS[session.objective] || 'huấn luyện'}".${
        session.outcome?.met === null || session.outcome?.met === undefined ? '' : ` ${session.outcome.summary}`
      }`,
    });
  }
  return careTasksCreated;
}


/**
 * A session's content from a kind of work: objective, intensity, type and the kind's default
 * workout, with any of the given overrides (a template day's distance, a race's distance…).
 */
function buildFromKind(kind, overrides = {}) {
  const k = SESSION_KINDS[kind];
  if (!k) return null;
  const prescription = { ...k.prescription };
  for (const f of ['distanceM', 'reps', 'targetSpeedKmh', 'targetHeartRateMax']) {
    if (overrides[f] != null) prescription[f] = overrides[f];
  }
  return { kind, objective: k.objective, intensity: k.intensity, sessionType: k.sessionType, prescription };
}

/**
 * Closes a running session once its sensor feed has covered the workout: same path as a trainer
 * marking it completed (outcome, care after hard work, exam if overexerted, owner told), done in
 * the name of whoever started it.
 */
async function autoComplete(session) {
  if (session.status !== 'in_progress') return false;
  session.status = 'completed';
  session.outcome = computeOutcome(session);
  await session.save();
  // Whoever pressed Bắt đầu, else the horse's trainer: the exam request and audit need a person.
  const horse = await Horse.findById(session.horse).select('assignedTrainer');
  const userId = session.startedBy || horse?.assignedTrainer;
  const user = userId ? await User.findById(userId).select('name role') : null;
  await logAction({
    actorId: user?._id || null,
    action: 'trainingSession.auto_complete',
    targetModel: 'TrainingSession',
    targetId: session._id,
    metadata: { distance: session.metrics?.distance, outcome: session.outcome?.met },
  });
  await onCompleted(session, user);
  return true;
}

module.exports = {
  computeOutcome,
  announceSessionToGroom,
  raiseExamIfOverexerted,
  createPostSessionCare,
  onCompleted,
  buildFromKind,
  autoComplete,
  OVEREXERTION_RATIO,
};
