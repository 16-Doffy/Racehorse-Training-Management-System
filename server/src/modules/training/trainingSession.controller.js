const TrainingSession = require('../../models/TrainingSession');
const TrainingPlan = require('../../models/TrainingPlan');
const Horse = require('../../models/Horse');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const pick = require('../../utils/pick');
const { pushNotification } = require('../alerts/notification.service');
const { computeReadiness, cautionGates, toSnapshot } = require('./readiness.service');
const {
  SESSION_STATUS,
  SESSION_STATUS_LABELS,
  SESSION_ERROR,
  SESSION_BODY_STATUSES,
  PRECHECK_VALID_HOURS,
  preCheckWindow,
  canTransition,
  SESSION_KINDS,
  PRESCRIPTION_RANGES,
  METRIC_RANGES,
  rangeProblem,
  kindSpeedProblem,
} = require('../../constants/training');
const { computeOutcome, announceSessionToGroom, raiseExamIfOverexerted, onCompleted, buildFromKind } = require('./trainingSession.service');
const { ROLES } = require('../../constants/roles');

// What the trainer describes when booking a session. Status, metrics, rating, outcome and the
// readiness snapshot are all server-owned or set through their own endpoints — accepting them
// here let a client create a session that was already "completed" with a made-up result.
const PLAN_FIELDS = ['kind', 'sessionType', 'objective', 'intensity', 'prescription', 'coachNote', 'scheduledAt', 'assignedTo'];

/**
 * Fills a booking from its kind of work: what the trainer left out (objective, intensity, type, the
 * workout's numbers) comes from the kind's defaults. Returns an error message or null.
 */
function applyKind(body) {
  if (body.kind === undefined || body.kind === null || body.kind === '') {
    delete body.kind;
    return null;
  }
  if (!SESSION_KINDS[body.kind]) return 'Loại buổi tập không hợp lệ.';
  const base = buildFromKind(body.kind);
  for (const f of ['objective', 'intensity', 'sessionType']) if (!body[f]) body[f] = base[f];
  body.prescription = { ...base.prescription, ...(body.prescription || {}) };
  return null;
}

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

  // The real clock of the session, next to the booked time: when it actually started and ended.
  if (next === 'in_progress') {
    session.startedBy = user._id;
    session.actualStartAt = new Date();
  }
  if (next === 'completed' && session.actualStartAt && !session.actualEndAt) {
    session.actualEndAt = new Date();
    session.actualDurationSec = Math.round((session.actualEndAt - session.actualStartAt) / 1000);
  }
  session.status = next;
  if (next === 'completed') effects.completed = true;
  return { effects };
}

/** Saves a session after applyStatusChange and runs the side effects it asked for. */
async function finishStatusChange(session, effects, user) {
  if (effects.completed) session.outcome = computeOutcome(session);
  await session.save();
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
  const problem = applyKind(body) || rangeProblem(body.prescription, PRESCRIPTION_RANGES) || kindSpeedProblem(body.kind, body.prescription?.targetSpeedKmh);
  if (problem) return fail(res, problem, 400);
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
  const problem =
    applyKind(changes) ||
    rangeProblem(changes.prescription, PRESCRIPTION_RANGES) ||
    kindSpeedProblem(changes.kind || session.kind, changes.prescription?.targetSpeedKmh);
  if (problem) return fail(res, problem, 400);
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

/**
 * Start: the only way a session reaches in_progress, and the moment the sensor feed may begin. It
 * needs a READY session (so the pre-check was done), a pre-check no older than PRECHECK_VALID_HOURS,
 * and no other session of the same horse running. Readiness is re-run for *now*: a horse locked since
 * the pre-check is refused and the session blocked. The start time is the server's, never the client's.
 */
const startSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return undefined;

  if (session.status !== SESSION_STATUS.READY) {
    const needsPreCheck = [SESSION_STATUS.SCHEDULED, SESSION_STATUS.BLOCKED].includes(session.status);
    return fail(
      res,
      needsPreCheck
        ? 'Hãy kiểm tra sẵn sàng (pre-check) trước khi bắt đầu buổi tập.'
        : `Không thể bắt đầu khi buổi tập đang "${SESSION_STATUS_LABELS[session.status] || session.status}".`,
      409,
      { code: needsPreCheck ? SESSION_ERROR.NOT_READY : SESSION_ERROR.INVALID_TRANSITION, from: session.status, to: SESSION_STATUS.IN_PROGRESS }
    );
  }

  const checkedAt = session.readiness?.checkedAt ? new Date(session.readiness.checkedAt) : null;
  if (!checkedAt || Date.now() - checkedAt.getTime() > PRECHECK_VALID_HOURS * 60 * 60 * 1000) {
    return fail(res, `Lần kiểm tra sẵn sàng đã quá ${PRECHECK_VALID_HOURS} giờ — hãy kiểm tra lại trước khi bắt đầu.`, 409, {
      code: SESSION_ERROR.PRECHECK_EXPIRED,
      checkedAt,
    });
  }

  if (await TrainingSession.exists({ horse: session.horse, status: SESSION_STATUS.IN_PROGRESS, _id: { $ne: session._id } })) {
    return fail(res, 'Ngựa này đang có một buổi tập khác diễn ra — hãy kết thúc buổi đó trước.', 409, {
      code: SESSION_ERROR.ANOTHER_SESSION_RUNNING,
    });
  }

  const overrideReason = typeof req.body?.overrideReason === 'string' ? req.body.overrideReason.trim() : '';
  const { readiness, error } = await checkReadiness(
    session.horse,
    { scheduledAt: new Date(), intensity: session.intensity, sessionType: session.sessionType, objective: session.objective },
    overrideReason || undefined
  );
  if (error) {
    const medicalBlock = error.status === 409 && error.data?.readiness && !error.data.requiresOverride;
    if (!medicalBlock) return fail(res, error.message, error.status, error.data);
    return markBlocked(res, session, error, req.user, 'trainingSession.start');
  }

  // The new snapshot replaces the old one, so what the pre-check recorded is carried over.
  const before = session.readiness || {};
  const snapshot = toSnapshot(readiness, { overrideReason: overrideReason || undefined, userId: req.user._id });
  if (!snapshot.overrideReason && before.overrideReason) {
    snapshot.overrideReason = before.overrideReason;
    snapshot.overriddenBy = before.overriddenBy;
  }
  Object.assign(snapshot, { confirmedBy: before.confirmedBy, bodyTempC: before.bodyTempC, trackCondition: before.trackCondition, weather: before.weather });
  for (const key of Object.keys(snapshot)) if (snapshot[key] === undefined) delete snapshot[key];

  // Claiming by status makes a double click (or two trainers) start the session once, not twice.
  const started = await TrainingSession.findOneAndUpdate(
    { _id: session._id, status: SESSION_STATUS.READY },
    { $set: { status: SESSION_STATUS.IN_PROGRESS, actualStartAt: new Date(), blockedReason: null, readiness: snapshot } },
    { new: true }
  );
  if (!started) {
    return fail(res, 'Buổi tập đã được bắt đầu hoặc không còn ở trạng thái sẵn sàng.', 409, {
      code: SESSION_ERROR.INVALID_TRANSITION,
      from: session.status,
      to: SESSION_STATUS.IN_PROGRESS,
    });
  }

  if (cautionGates(readiness).length > 0) {
    await reportOverride({ session: started, readiness, reason: overrideReason, user: req.user, moment: 'start' });
  }
  await logAction({ actorId: req.user._id, action: 'trainingSession.start', targetModel: 'TrainingSession', targetId: session._id });
  return ok(res, started, 'Training session started.');
});

/** A medical block found at a decision point: the session is held back, the reason kept, the 409 sent. */
async function markBlocked(res, session, error, user, action) {
  session.status = SESSION_STATUS.BLOCKED;
  session.blockedReason = error.message;
  session.readiness = toSnapshot(error.data.readiness, { userId: user._id });
  await session.save();
  await logAction({
    actorId: user._id,
    action,
    targetModel: 'TrainingSession',
    targetId: session._id,
    metadata: { result: 'blocked', reason: error.message },
  });
  return fail(res, error.message, 409, { code: SESSION_ERROR.READINESS_BLOCKED, readiness: error.data.readiness });
}

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

  if (session.status !== SESSION_STATUS.READY && !canTransition(session.status, SESSION_STATUS.READY)) {
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

    return markBlocked(res, session, error, req.user, 'trainingSession.pre_check');
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
  const metricProblem = rangeProblem(metrics, METRIC_RANGES);
  if (metricProblem) return fail(res, metricProblem, 400);

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
