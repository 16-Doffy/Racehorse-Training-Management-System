const TrainingSession = require('../../models/TrainingSession');
const TrainingPlan = require('../../models/TrainingPlan');
const Horse = require('../../models/Horse');
const DailyTask = require('../../models/DailyTask');
const StableAssignment = require('../../models/StableAssignment');
const ExamRequest = require('../../models/ExamRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const pick = require('../../utils/pick');
const { pushNotification, notifyCaretaker } = require('../alerts/notification.service');
const { openExamRequest } = require('../health/examRequest.service');
const { computeReadiness, cautionGates, toSnapshot, MIN_DIGEST_MINUTES } = require('./readiness.service');
const {
  OBJECTIVE_LABELS,
  SESSION_STATUS,
  SESSION_STATUS_LABELS,
  SESSION_ERROR,
  SESSION_BODY_STATUSES,
  preCheckWindow,
  canTransition,
} = require('../../constants/training');
const { ROLES } = require('../../constants/roles');

// What the trainer describes when booking a session. Status, metrics, rating, outcome and the
// readiness snapshot are all server-owned or set through their own endpoints — accepting them
// here let a client create a session that was already "completed" with a made-up result.
const PLAN_FIELDS = ['sessionType', 'objective', 'intensity', 'prescription', 'coachNote', 'scheduledAt', 'assignedTo'];

/** Loads a session the caller may act on, or sends the appropriate error and returns null. */
async function loadSession(req, res) {
  const session = await TrainingSession.findById(req.params.id);
  if (!session) {
    fail(res, 'Training session not found.', 404);
    return null;
  }
  if (!(await canAccessHorse(req.user, session.horse))) {
    fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
    return null;
  }
  return session;
}

/** A trainer went ahead past an amber gate: put it on the record and tell the manager. */
async function reportOverride({ session, readiness, reason, user, moment }) {
  const cautions = cautionGates(readiness);
  await logAction({
    actorId: user._id,
    action: 'trainingSession.readiness_override',
    targetModel: 'TrainingSession',
    targetId: session._id,
    metadata: { reason, moment, gates: cautions.map((g) => g.key) },
  });
  await pushNotification({
    recipientRole: ROLES.MANAGER,
    horse: session.horse,
    trainingSession: session._id,
    type: 'readiness_override',
    severity: 'warning',
    message: `⚠️ ${user.name} vẫn ${{ start: 'bắt đầu', precheck: 'xác nhận sẵn sàng' }[moment] || 'xếp'} buổi tập cho ${readiness.horse.name} dù có ${
      cautions.length
    } cảnh báo (${cautions.map((g) => g.label).join(', ')}). Lý do: ${reason}`,
  });
}

/**
 * Runs the readiness gates for a decision point (booking or starting a session).
 * Returns { readiness } when the decision may go ahead, or { error } describing the 409 to send:
 * a vet's block is final, an amber gate needs the trainer to say why.
 */
async function checkReadiness(horseId, context, overrideReason) {
  const readiness = await computeReadiness(horseId, context);
  if (!readiness) return { error: { status: 404, message: 'Horse not found.' } };

  const blocked = readiness.gates.find((g) => g.status === 'blocked');
  if (blocked) return { error: { status: 409, message: blocked.detail, data: { readiness } } };

  const cautions = cautionGates(readiness);
  if (cautions.length > 0 && !overrideReason) {
    return {
      error: {
        status: 409,
        message: `Buổi tập này có ${cautions.length} cảnh báo cần xác nhận.`,
        data: { readiness, requiresOverride: true },
      },
    };
  }
  return { readiness };
}

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
 * The one place a session's status changes. Every route that can move a session (update, start,
 * evaluation) goes through here, so no route can skip the lock and readiness checks — the
 * evaluation endpoint used to set in_progress without either.
 *
 * Mutates `session` (unsaved) and returns { error } or { effects } for the caller to finish.
 */
async function applyStatusChange(session, next, { user, overrideReason }) {
  const current = session.status;
  if (!next || next === current) return { effects: {} };

  // Ready and blocked are not something a request can ask for: they are reached only through the
  // pre-check, which is what looks at the horse.
  if (!SESSION_BODY_STATUSES.includes(next)) {
    return {
      error: {
        status: 409,
        message: `Không thể đặt trực tiếp trạng thái "${SESSION_STATUS_LABELS[next] || next}".`,
        data: { code: SESSION_ERROR.INVALID_TRANSITION, from: current, to: next },
      },
    };
  }

  if (!canTransition(current, next)) {
    return {
      error: {
        status: 409,
        message: `Không thể chuyển buổi tập từ "${SESSION_STATUS_LABELS[current]}" sang "${SESSION_STATUS_LABELS[next]}".`,
        data: { code: SESSION_ERROR.INVALID_TRANSITION, from: current, to: next },
      },
    };
  }

  const effects = {};
  if (next === 'in_progress') {
    // Starting is a second decision point: a horse fine on Monday can be locked by Wednesday, or
    // have been fed twenty minutes ago. Checked against *now*, not the booked time.
    const context = { scheduledAt: new Date(), intensity: session.intensity, sessionType: session.sessionType, objective: session.objective };
    const { readiness, error } = await checkReadiness(session.horse, context, overrideReason);
    if (error) return { error };

    const snapshot = toSnapshot(readiness, { overrideReason, userId: user._id });
    // Keep a booking-time override on record if starting raised nothing new.
    if (!snapshot.overrideReason && session.readiness?.overrideReason) {
      snapshot.overrideReason = session.readiness.overrideReason;
      snapshot.overriddenBy = session.readiness.overriddenBy;
    }
    session.readiness = snapshot;
    if (cautionGates(readiness).length > 0) effects.override = { readiness, reason: overrideReason, moment: 'start' };
  }

  session.status = next;
  if (next === 'completed') effects.completed = true;
  return { effects };
}

/** Saves a session after applyStatusChange and runs the side effects it asked for. */
async function finishStatusChange(session, effects, user) {
  if (effects.completed) session.outcome = computeOutcome(session);
  await session.save();
  if (effects.override) await reportOverride({ session, user, ...effects.override });
  return effects.completed ? onCompleted(session, user) : 0;
}

/* -------------------------------------------------------------------------- */

const listSessions = asyncHandler(async (req, res) => {
  const { trainingPlan, status, sessionType } = req.query;
  const filter = {};
  const horse = await horseFilter(req.user, req.query.horse);
  if (horse !== undefined) filter.horse = horse;
  if (trainingPlan) filter.trainingPlan = trainingPlan;
  if (status) filter.status = status;
  if (sessionType) filter.sessionType = sessionType;

  const sessions = await TrainingSession.find(filter)
    .populate('horse', 'name healthStatus')
    .populate('assignedTo', 'name')
    .sort({ scheduledAt: -1 });
  return ok(res, sessions, 'Training sessions fetched.');
});

const getSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return undefined;
  await session.populate([{ path: 'horse' }, { path: 'trainingPlan' }, { path: 'assignedTo', select: 'name' }]);
  return ok(res, session, 'Training session fetched.');
});

/**
 * The readiness board: four gates, each owned by a different role (see readiness.service.js).
 * Its own endpoint so the trainer's form can show it live, and so the vet's, groom's and owner's
 * screens can render the same answer without duplicating the rules.
 */
const getReadiness = asyncHandler(async (req, res) => {
  const { horse, scheduledAt, intensity, sessionType, objective } = req.query;
  if (!horse) return fail(res, 'horse is required.', 400);
  if (!(await canAccessHorse(req.user, horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const readiness = await computeReadiness(horse, { scheduledAt, intensity, sessionType, objective });
  if (!readiness) return fail(res, 'Horse not found.', 404);
  return ok(res, readiness, 'Readiness computed.');
});

// This is where the Veterinarian's emergency "lock training" order takes effect for new
// sessions, along with the three advisory gates (see readiness.service.js).
const createSession = asyncHandler(async (req, res) => {
  const { trainingPlan: planId, horse, overrideReason } = req.body;

  if (!(await canAccessHorse(req.user, horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

  const plan = await TrainingPlan.findById(planId);
  if (!plan) return fail(res, 'Training plan not found.', 404);
  // Two independent pickers in the form meant a session could be filed under a different horse's
  // plan, which then showed up in the wrong plan's session list.
  if (String(plan.horse) !== String(horse)) return fail(res, 'Kế hoạch đã chọn không thuộc ngựa này.', 400);
  if (['completed', 'cancelled'].includes(plan.status)) {
    return fail(res, 'Kế hoạch này đã kết thúc hoặc bị hủy — không thể thêm buổi tập.', 409);
  }

  const body = pick(req.body, PLAN_FIELDS);
  const { readiness, error } = await checkReadiness(
    horse,
    { scheduledAt: body.scheduledAt, intensity: body.intensity, sessionType: body.sessionType, objective: body.objective },
    overrideReason
  );
  if (error) {
    const prefix = error.data?.requiresOverride ? '' : 'Không thể tạo buổi tập: ';
    return fail(res, `${prefix}${error.message}`, error.status, error.data);
  }

  const session = await TrainingSession.create({
    ...body,
    trainingPlan: plan._id,
    horse,
    // Creating a session only books it. Running it is a separate act (POST /:id/start), so a
    // `status` sent in the body is ignored: otherwise creating one would switch the sensor feed on.
    status: SESSION_STATUS.SCHEDULED,
    readiness: toSnapshot(readiness, { overrideReason, userId: req.user._id }),
  });

  await logAction({ actorId: req.user._id, action: 'trainingSession.create', targetModel: 'TrainingSession', targetId: session._id });
  if (cautionGates(readiness).length > 0) {
    await reportOverride({ session, readiness, reason: overrideReason, user: req.user, moment: 'create' });
  }
  await announceSessionToGroom(session, readiness.horse.name);
  return created(res, session, 'Training session created.');
});

// Editing the booking itself (time, content, briefing). Allowed only while it's still scheduled;
// a status in the body goes through the same transition rules as everywhere else.
const updateSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return undefined;

  const changes = pick(req.body, PLAN_FIELDS);
  if (Object.keys(changes).length > 0 && session.status !== 'scheduled') {
    return fail(res, 'Chỉ sửa được nội dung buổi tập khi buổi tập còn ở trạng thái "đã lên lịch".', 409, {
      code: SESSION_ERROR.NOT_EDITABLE,
    });
  }
  const previousTime = new Date(session.scheduledAt).getTime();
  Object.assign(session, changes);

  const { effects, error } = await applyStatusChange(session, req.body.status, {
    user: req.user,
    overrideReason: req.body.overrideReason,
  });
  if (error) return fail(res, error.message, error.status, error.data);

  await finishStatusChange(session, effects, req.user);
  // A moved session moves the groom's feeding deadline with it.
  if (new Date(session.scheduledAt).getTime() !== previousTime) {
    const horse = await Horse.findById(session.horse).select('name');
    await announceSessionToGroom(session, horse?.name || 'Ngựa');
  }
  await logAction({ actorId: req.user._id, action: 'trainingSession.update', targetModel: 'TrainingSession', targetId: session._id });
  return ok(res, session, 'Training session updated.');
});

// "Start now": the explicit version of moving a session to in_progress, rechecking readiness
// against the current moment (a horse fed twenty minutes ago is flagged here, not at booking).
const startSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return undefined;

  const { effects, error } = await applyStatusChange(session, 'in_progress', {
    user: req.user,
    overrideReason: req.body?.overrideReason,
  });
  if (error) return fail(res, error.message, error.status, error.data);

  await finishStatusChange(session, effects, req.user);
  await logAction({ actorId: req.user._id, action: 'trainingSession.start', targetModel: 'TrainingSession', targetId: session._id });
  return ok(res, session, 'Training session started.');
});

/**
 * Pre-check: the trainer looks at the horse close to the session and the system re-runs the readiness
 * gates for *now*. Passing makes the session READY, which is the only state a session is started from.
 * A medical block (vet's lock, injury) makes it BLOCKED, and a pre-check can be filed again from there
 * once the block is gone. An amber gate needs an `overrideReason`. Confirming is itself required: the
 * trainer, not the system, says the horse was seen.
 */
const preCheckSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return undefined;

  if (!canTransition(session.status, SESSION_STATUS.READY)) {
    return fail(res, `Không thể kiểm tra sẵn sàng khi buổi tập đang "${SESSION_STATUS_LABELS[session.status]}".`, 409, {
      code: SESSION_ERROR.INVALID_TRANSITION,
      from: session.status,
      to: SESSION_STATUS.READY,
    });
  }

  const body = req.body || {};
  if (body.confirmed !== true) {
    return fail(res, 'Hãy xác nhận bạn đã quan sát ngựa trước khi buổi tập.', 400, { code: SESSION_ERROR.PRECHECK_NOT_CONFIRMED });
  }

  let bodyTempC;
  if (body.bodyTempC !== undefined && body.bodyTempC !== null && body.bodyTempC !== '') {
    bodyTempC = Number(body.bodyTempC);
    if (!Number.isFinite(bodyTempC) || bodyTempC < 30 || bodyTempC > 45) {
      return fail(res, 'Nhiệt độ cơ thể không hợp lệ (30–45 °C).', 400);
    }
  }

  const window = preCheckWindow(session.scheduledAt);
  if (!window.open) {
    return fail(res, 'Chưa tới (hoặc đã quá) giờ kiểm tra sẵn sàng của buổi tập này.', 409, {
      code: SESSION_ERROR.OUTSIDE_PRECHECK_WINDOW,
      opensAt: window.opensAt,
      closesAt: window.closesAt,
    });
  }

  const overrideReason = typeof body.overrideReason === 'string' ? body.overrideReason.trim() : '';
  const { readiness, error } = await checkReadiness(
    session.horse,
    { scheduledAt: new Date(), intensity: session.intensity, sessionType: session.sessionType, objective: session.objective },
    overrideReason || undefined
  );

  if (error) {
    const medicalBlock = error.status === 409 && error.data?.readiness && !error.data.requiresOverride;
    if (!medicalBlock) return fail(res, error.message, error.status, error.data);

    session.status = SESSION_STATUS.BLOCKED;
    session.blockedReason = error.message;
    session.readiness = toSnapshot(error.data.readiness, { userId: req.user._id });
    await session.save();
    await logAction({
      actorId: req.user._id,
      action: 'trainingSession.pre_check',
      targetModel: 'TrainingSession',
      targetId: session._id,
      metadata: { result: 'blocked', reason: error.message },
    });
    return fail(res, error.message, 409, { code: SESSION_ERROR.READINESS_BLOCKED, readiness: error.data.readiness });
  }

  const snapshot = toSnapshot(readiness, { overrideReason: overrideReason || undefined, userId: req.user._id });
  // Keep a booking-time override on record if the pre-check raised nothing new.
  if (!snapshot.overrideReason && session.readiness?.overrideReason) {
    snapshot.overrideReason = session.readiness.overrideReason;
    snapshot.overriddenBy = session.readiness.overriddenBy;
  }
  snapshot.confirmedBy = req.user._id;
  if (bodyTempC !== undefined) snapshot.bodyTempC = bodyTempC;
  if (typeof body.trackCondition === 'string' && body.trackCondition.trim()) snapshot.trackCondition = body.trackCondition.trim();
  if (typeof body.weather === 'string' && body.weather.trim()) snapshot.weather = body.weather.trim();

  session.readiness = snapshot;
  session.status = SESSION_STATUS.READY;
  session.blockedReason = undefined;
  await session.save();

  const overridden = cautionGates(readiness).length > 0;
  if (overridden) await reportOverride({ session, readiness, reason: overrideReason, user: req.user, moment: 'precheck' });
  await logAction({
    actorId: req.user._id,
    action: 'trainingSession.pre_check',
    targetModel: 'TrainingSession',
    targetId: session._id,
    metadata: { result: 'ready', overridden },
  });
  return ok(res, session, 'Pre-check passed: the session is ready.');
});

// Trainer's post-session evaluation: performance rating, professional comment, measured metrics.
const recordEvaluation = asyncHandler(async (req, res) => {
  const { trainerComment, performanceRating, metrics, status, overrideReason, videoUrl } = req.body;
  const session = await loadSession(req, res);
  if (!session) return undefined;

  const { effects, error } = await applyStatusChange(session, status, { user: req.user, overrideReason });
  if (error) return fail(res, error.message, error.status, error.data);

  // A score describes a finished session; rating one that hasn't happened yet means nothing.
  if (performanceRating !== undefined && performanceRating !== null && session.status !== 'completed') {
    return fail(res, 'Chỉ chấm điểm phong độ khi buổi tập đã hoàn thành.', 400);
  }

  if (videoUrl !== undefined && videoUrl !== null && videoUrl !== '') {
    if (!/^https?:\/\/\S+$/i.test(String(videoUrl).trim())) {
      return fail(res, 'Link video phải là một địa chỉ http(s) hợp lệ.', 400);
    }
    session.videoUrl = String(videoUrl).trim();
  } else if (videoUrl === '' || videoUrl === null) {
    session.videoUrl = undefined;
  }
  if (trainerComment !== undefined) session.trainerComment = trainerComment;
  if (performanceRating !== undefined) session.performanceRating = performanceRating;
  if (metrics !== undefined) session.metrics = { ...session.metrics.toObject(), ...metrics };
  // Re-judged whenever the numbers change on a finished session, not only at the moment it ends.
  const reJudged = session.status === 'completed' && !effects.completed;
  if (reJudged) session.outcome = computeOutcome(session);

  const careTasksCreated = await finishStatusChange(session, effects, req.user);
  // Numbers entered after the session was closed get the same overexertion check as live ones.
  if (reJudged && metrics !== undefined) {
    const horse = await Horse.findById(session.horse).select('name');
    if (horse) await raiseExamIfOverexerted(session, req.user, horse);
  }
  await logAction({
    actorId: req.user._id,
    action: 'trainingSession.evaluate',
    targetModel: 'TrainingSession',
    targetId: session._id,
    metadata: { outcome: session.outcome?.met, careTasksCreated },
  });
  return ok(res, session, 'Session evaluation recorded.');
});

// A finished session is the record of work done and what came of it; only bookings that never
// happened can be removed.
const deleteSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return undefined;
  if (['completed', 'in_progress'].includes(session.status)) {
    return fail(res, 'Không xoá được buổi tập đang diễn ra hoặc đã hoàn thành — đó là hồ sơ huấn luyện.', 409, {
      code: SESSION_ERROR.NOT_DELETABLE,
    });
  }
  await session.deleteOne();
  await logAction({ actorId: req.user._id, action: 'trainingSession.delete', targetModel: 'TrainingSession', targetId: session._id });
  return ok(res, null, 'Training session deleted.');
});

module.exports = {
  listSessions,
  getSession,
  getReadiness,
  createSession,
  updateSession,
  startSession,
  preCheckSession,
  recordEvaluation,
  deleteSession,
};
