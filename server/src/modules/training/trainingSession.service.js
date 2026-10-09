const TrainingSession = require('../../models/TrainingSession');
const Horse = require('../../models/Horse');
const User = require('../../models/User');
const DailyTask = require('../../models/DailyTask');
const StableAssignment = require('../../models/StableAssignment');
const ExamRequest = require('../../models/ExamRequest');
const { logAction } = require('../audit/audit.service');
const { pushNotification, notifyCaretaker } = require('../alerts/notification.service');
const { openExamRequest } = require('../health/examRequest.service');
const { flagConfirmedEntries } = require('../race/raceDecision.service');
const { MIN_DIGEST_MINUTES } = require('./readiness.service');
const clubPolicy = require('../../config/clubPolicy');
const {
  OBJECTIVE_LABELS,
  SESSION_KINDS,
  SESSION_STATUS,
  PRECHECK_WINDOW,
  PRECHECK_VALID_HOURS,
  ABORT_CATEGORY_LABELS,
  ABORT_NEEDS_EXAM,
  canTransition,
} = require('../../constants/training');
const { notifyHorseStaff } = require('../alerts/notification.service');

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
    // The work is every rep: 3 × 1200 m is 3600 m, which is what the sensor counts.
    const total = p.distanceM * (p.reps || 1);
    checks.push({ ok: m.distance >= total, text: `cự ly ${m.distance}/${total} m` });
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

// A time this many minutes from now, and its "HH:mm".
const dueAt = (minutes) => {
  const at = new Date(Date.now() + minutes * 60000);
  at.setSeconds(0, 0);
  return at;
};
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

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
    // Icing straight after the work while the legs are warm, the bath once the horse has cooled down.
    { taskType: 'icing', afterMinutes: clubPolicy.icingAfterMin, note: `Sau buổi ${what} — ngâm chân hạ nhiệt gân.` },
    { taskType: 'bathing', afterMinutes: clubPolicy.bathingAfterMin, note: `Sau buổi ${what} — tắm và lau khô.` },
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
      scheduledDate: dueAt(item.afterMinutes),
      dueTime: hhmm(dueAt(item.afterMinutes)),
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
      message: `🧊 Ngựa vừa xong buổi ${what} — việc chăm sóc sau tập: ngâm chân lúc ${hhmm(dueAt(clubPolicy.icingAfterMin))}, tắm lúc ${hhmm(dueAt(clubPolicy.bathingAfterMin))}.`,
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

/** Who a closed run is recorded against when nobody pressed a button: whoever started it, else the trainer. */
async function actorFor(session) {
  const horse = await Horse.findById(session.horse).select('assignedTrainer');
  const userId = session.startedBy || horse?.assignedTrainer;
  return userId ? User.findById(userId).select('name role') : null;
}

/**
 * Closes a running session: completed when the work is done (the sensor feed or the trainer), aborted
 * when it was stopped part-way (the trainer, the vet's lock, the horse leaving the club).
 *
 * One atomic claim on in_progress: a double click, a retry, the simulator's next tick or a lock landing
 * at the same moment cannot close it twice, and only the caller that wins runs what follows (outcome,
 * care after hard work, exam request, owner told). Returns the closed session, or null when it was not
 * running (anymore).
 *
 * The clock is the server's: actualEndAt is now and actualDurationSec is end − start. Work covered on
 * the simulator's compressed clock goes to simulatedWorkSec and never replaces the real times.
 * `metrics` (measured by hand) is accepted only for a run the sensor never reported on.
 */
async function closeRun(sessionId, { to, user = null, abortCategory, abortReason, workedSeconds, metrics } = {}) {
  const current = await TrainingSession.findById(sessionId).select('status actualStartAt metrics.sampleCount');
  if (!current || current.status !== SESSION_STATUS.IN_PROGRESS) return null;
  const now = new Date();
  const startedAt = current.actualStartAt || now;
  const set = {
    status: to,
    actualStartAt: startedAt,
    actualEndAt: now,
    actualDurationSec: Math.max(0, Math.round((now - startedAt) / 1000)),
    endedBy: user?._id || null,
  };
  if (workedSeconds != null) set.simulatedWorkSec = workedSeconds;
  if (metrics && !current.metrics?.sampleCount) {
    for (const [key, value] of Object.entries(metrics)) {
      if (['avgHeartRate', 'maxHeartRate', 'maxSpeed', 'distance'].includes(key) && value !== undefined && value !== null && value !== '') {
        set[`metrics.${key}`] = Number(value);
      }
    }
  }
  if (to === SESSION_STATUS.ABORTED) Object.assign(set, { abortCategory, abortReason });

  const session = await TrainingSession.findOneAndUpdate({ _id: sessionId, status: SESSION_STATUS.IN_PROGRESS }, { $set: set }, { new: true });
  if (!session) return null;

  const actor = user?.name ? user : (await actorFor(session)) || user;
  if (to === SESSION_STATUS.COMPLETED) {
    session.outcome = computeOutcome(session);
    await TrainingSession.updateOne({ _id: session._id }, { $set: { outcome: session.outcome } });
    if (actor?._id) {
      await logAction({
        actorId: actor._id,
        action: user ? 'trainingSession.end' : 'trainingSession.auto_complete',
        targetModel: 'TrainingSession',
        targetId: session._id,
        metadata: { distance: session.metrics?.distance, outcome: session.outcome?.met, durationSec: session.actualDurationSec },
      });
    }
    await onCompleted(session, actor);
  } else {
    if (actor?._id) {
      await logAction({
        actorId: actor._id,
        action: 'trainingSession.abort',
        targetModel: 'TrainingSession',
        targetId: session._id,
        metadata: { category: abortCategory, reason: abortReason, distance: session.metrics?.distance },
      });
    }
    await onAborted(session, actor);
  }
  return session;
}

/**
 * A run stopped part-way: the owner is told, the trainer too when someone else stopped it (the vet's
 * lock), and when the reason is the horse itself the vet is asked to look at it. No care-after-work
 * tasks: those follow work that was done.
 */
async function onAborted(session, actor) {
  const horse = await Horse.findById(session.horse).select('name owner');
  if (!horse) return;
  const what = (SESSION_KINDS[session.kind]?.label || OBJECTIVE_LABELS[session.objective] || 'buổi tập').toLowerCase();
  const why = `${ABORT_CATEGORY_LABELS[session.abortCategory] || 'dừng'}${session.abortReason ? `: ${session.abortReason}` : ''}`;
  const ran = session.metrics?.distance ? ` sau ${session.metrics.distance} m` : '';
  if (horse.owner) {
    await pushNotification({
      recipientUser: horse.owner,
      horse: horse._id,
      trainingSession: session._id,
      type: 'session_completed',
      severity: 'warning',
      message: `⏹ ${horse.name} dừng buổi ${what} giữa chừng${ran} — ${why}.`,
    });
  }
  if (['medical_lock', 'horse_left'].includes(session.abortCategory)) {
    await notifyHorseStaff({
      staff: 'trainer',
      horse: horse._id,
      trainingSession: session._id,
      type: 'session_completed',
      severity: 'warning',
      message: `⏹ Buổi ${what} đang chạy của ${horse.name} đã được dừng${ran} — ${why}. Số liệu đến lúc dừng được giữ lại.`,
    });
  }
  if (ABORT_NEEDS_EXAM.includes(session.abortCategory)) {
    await flagConfirmedEntries(horse._id, `dừng buổi tập giữa chừng — ${why}`);
  }
  if (ABORT_NEEDS_EXAM.includes(session.abortCategory) && actor?._id) {
    if (!(await ExamRequest.exists({ horse: horse._id, status: 'pending' }))) {
      await openExamRequest({
        horse,
        requestedBy: actor,
        reason: `Dừng buổi ${what} giữa chừng — ${why}.`,
        priority: 'high',
        trainingSession: session._id,
        message: `🩺 [ƯU TIÊN CAO] ${horse.name} phải dừng buổi ${what} giữa chừng — ${why}. Cần bác sĩ khám.`,
      });
    }
  }
}

/** The sensor feed covered the workout: the run is completed, its simulated work kept apart. */
async function autoComplete(session, { workedSeconds } = {}) {
  return Boolean(await closeRun(session._id, { to: SESSION_STATUS.COMPLETED, workedSeconds }));
}

/**
 * Sessions nobody ran: past the pre-check window (30 min after the booked time) without a pre-check,
 * or pre-checked but not started while the check was still valid (2 h). They become "missed" and
 * the trainer is told, so they can book it again — instead of sitting "scheduled" forever.
 * Returns how many were marked.
 */
async function markMissedSessions(now = new Date()) {
  const windowClosed = new Date(now.getTime() - PRECHECK_WINDOW.closesAfterMin * 60 * 1000);
  const checkExpired = now.getTime() - PRECHECK_VALID_HOURS * 60 * 60 * 1000;
  const candidates = await TrainingSession.find({
    status: { $in: [SESSION_STATUS.SCHEDULED, SESSION_STATUS.BLOCKED, SESSION_STATUS.READY] },
    scheduledAt: { $lt: windowClosed },
  }).populate('horse', 'name assignedTrainer');

  let marked = 0;
  for (const s of candidates) {
    const checkedAt = s.readiness?.checkedAt ? new Date(s.readiness.checkedAt).getTime() : null;
    // A ready session can still be started while its pre-check is valid.
    if (s.status === SESSION_STATUS.READY && checkedAt !== null && checkedAt >= checkExpired) continue;
    if (!canTransition(s.status, SESSION_STATUS.MISSED)) continue;
    // The trainer may have moved or pre-checked the session since it was read. Claim only the
    // same booking, and recheck that a ready session still has no valid pre-check.
    const filter = { _id: s._id, status: s.status, scheduledAt: s.scheduledAt };
    if (s.status === SESSION_STATUS.READY) {
      filter.$or = [
        { 'readiness.checkedAt': null },
        { 'readiness.checkedAt': { $lt: new Date(checkExpired) } },
      ];
    }
    // eslint-disable-next-line no-await-in-loop
    const claimed = await TrainingSession.updateOne(filter, { $set: { status: SESSION_STATUS.MISSED } });
    if (!claimed.modifiedCount) continue;
    marked += 1;

    const what = (SESSION_KINDS[s.kind]?.label || OBJECTIVE_LABELS[s.objective] || 'buổi tập').toLowerCase();
    const at = hhmm(new Date(s.scheduledAt));
    const day = new Date(s.scheduledAt).toLocaleDateString('vi-VN');
    const horseName = s.horse?.name || 'Ngựa';
    // A failed notification must not stop the other sessions from being marked.
    // eslint-disable-next-line no-await-in-loop
    await notifyHorseStaff({
      staff: 'trainer',
      horse: s.horse?._id || s.horse,
      trainingSession: s._id,
      type: 'session_scheduled',
      severity: 'warning',
      message: `⏰ Buổi ${what} ${at} ngày ${day} của ${horseName} đã lỡ giờ (không kiểm tra/bắt đầu kịp) — vào Buổi tập để xếp lại.`,
    }).catch((err) => console.error('[missed-sessions] notify failed:', err.message));
    if (s.horse?.assignedTrainer) {
      // eslint-disable-next-line no-await-in-loop
      await logAction({
        actorId: s.horse.assignedTrainer,
        action: 'trainingSession.missed',
        targetModel: 'TrainingSession',
        targetId: s._id,
        metadata: { from: s.status, scheduledAt: s.scheduledAt },
      });
    }
  }
  return marked;
}

module.exports = {
  markMissedSessions,
  computeOutcome,
  announceSessionToGroom,
  raiseExamIfOverexerted,
  createPostSessionCare,
  onCompleted,
  buildFromKind,
  autoComplete,
  closeRun,
  OVEREXERTION_RATIO,
};
