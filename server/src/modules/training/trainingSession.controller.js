const TrainingSession = require('../../models/TrainingSession');
const TrainingPlan = require('../../models/TrainingPlan');
const Horse = require('../../models/Horse');
const ExamRequest = require('../../models/ExamRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const pick = require('../../utils/pick');
const { pushNotification } = require('../alerts/notification.service');
const { openExamRequest } = require('../health/examRequest.service');
const { computeReadiness, cautionGates, toSnapshot, getMedicalBlock } = require('./readiness.service');
const {
  SESSION_STATUS,
  SESSION_STATUS_LABELS,
  SESSION_ERROR,
  SESSION_BODY_STATUSES,
  PRECHECK_VALID_HOURS,
  PRECHECK_FEVER_C,
  NORMAL_TEMP_RANGE,
  preCheckWindow,
  canTransition,
  SESSION_KINDS,
  PRESCRIPTION_RANGES,
  METRIC_RANGES,
  TRAINER_ABORT_CATEGORIES,
  ABORT_CATEGORY_LABELS,
  rangeProblem,
  kindSpeedProblem,
} = require('../../constants/training');
const { announceSessionToGroom, buildFromKind, closeRun } = require('./trainingSession.service');
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
async function checkReadiness(horseId, context, overrideReason, standing) {
  const readiness = await computeReadiness(horseId, context);
  if (!readiness) return { error: { status: 404, message: 'Horse not found.' } };

  const blocked = readiness.gates.find((g) => g.status === 'blocked');
  if (blocked) return { error: { status: 409, message: blocked.detail, data: { readiness } } };

  const cautions = cautionGates(readiness);
  const carried = overrideReason ? undefined : standingOverride(standing, readiness);
  if (cautions.length > 0 && !overrideReason && !carried) {
    return {
      error: {
        status: 409,
        message: `Buổi tập này có ${cautions.length} cảnh báo cần xác nhận.`,
        data: { readiness, requiresOverride: true },
      },
    };
  }
  return { readiness, carried };
}

/**
 * The reason a trainer gave less than PRECHECK_VALID_HOURS ago for these very warnings, which still
 * stands: booked 20 minutes ago past a meal warning, the pre-check (and then the start) does not ask
 * again for the same thing. A new or different warning does need a new reason.
 */
function standingOverride(snapshot, readiness) {
  if (!snapshot?.overrideReason || !snapshot.checkedAt) return undefined;
  if (Date.now() - new Date(snapshot.checkedAt).getTime() > PRECHECK_VALID_HOURS * 60 * 60 * 1000) return undefined;
  // The same warning, word for word: "no meal in 24 hours" accepted at booking does not cover "ate
  // 75 minutes ago" found at the pre-check.
  const said = (g) => `${g.key}|${g.detail || ''}`;
  const accepted = (snapshot.gates || []).filter((g) => g.status === 'caution').map(said);
  const now = cautionGates(readiness).map(said);
  return now.length > 0 && now.every((warning) => accepted.includes(warning)) ? snapshot.overrideReason : undefined;
}

/**
 * A bare `status` in a PUT body: the only one allowed is cancelling a booking that never ran. Mutates
 * `session` (unsaved) and returns { error } when refused.
 */
async function applyStatusChange(session, next, { cancelReason }) {
  const current = session.status;
  if (!next || next === current) return {};

  // Only calling off a booking can be asked for with a bare status. Ready and blocked come from the
  // pre-check; a run is started, ended, stopped or evaluated through its own endpoint.
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
    const running = current === SESSION_STATUS.IN_PROGRESS;
    return {
      error: {
        status: 409,
        message: running
          ? 'Buổi tập đang chạy không hủy được — dùng "Dừng giữa chừng" để giữ lại số liệu đã đo.'
          : `Không thể chuyển buổi tập từ "${SESSION_STATUS_LABELS[current]}" sang "${SESSION_STATUS_LABELS[next]}".`,
        data: { code: SESSION_ERROR.INVALID_TRANSITION, from: current, to: next },
      },
    };
  }
  if (next === SESSION_STATUS.CANCELLED && typeof cancelReason === 'string' && cancelReason.trim()) session.cancelReason = cancelReason.trim();
  session.status = next;
  return {};
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
  if (!(new Date(body.scheduledAt) > new Date())) {
    return fail(res, 'Chọn giờ tập ở tương lai.', 400);
  }
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
  // Moving the booking invalidates the old observation: it must be pre-checked at its new time.
  // Claim by status and time so a session that started meanwhile cannot be moved back to scheduled.
  const timeOnly = Object.keys(changes).length === 1 && changes.scheduledAt !== undefined && req.body.status === undefined;
  if (timeOnly) {
    if (![SESSION_STATUS.SCHEDULED, SESSION_STATUS.READY, SESSION_STATUS.BLOCKED].includes(session.status)) {
      return fail(res, 'Chỉ đổi giờ được buổi tập chưa bắt đầu.', 409, { code: SESSION_ERROR.NOT_EDITABLE });
    }
    const scheduledAt = new Date(changes.scheduledAt);
    if (!(scheduledAt > new Date())) return fail(res, 'Giờ tập mới phải ở tương lai.', 400);
    const moved = await TrainingSession.findOneAndUpdate(
      { _id: session._id, status: session.status, scheduledAt: session.scheduledAt },
      { $set: { scheduledAt, status: SESSION_STATUS.SCHEDULED }, $unset: { readiness: 1, blockedReason: 1 } },
      { new: true }
    );
    if (!moved) return fail(res, 'Buổi tập đã thay đổi hoặc bắt đầu — tải lại trước khi đổi giờ.', 409, { code: SESSION_ERROR.NOT_EDITABLE });
    const horse = await Horse.findById(moved.horse).select('name');
    await announceSessionToGroom(moved, horse?.name || 'Ngựa');
    await logAction({ actorId: req.user._id, action: 'trainingSession.update', targetModel: 'TrainingSession', targetId: moved._id });
    return ok(res, moved, 'Training session updated.');
  }
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
  if (changes.scheduledAt !== undefined && !(new Date(changes.scheduledAt) > new Date())) {
    return fail(res, 'Giờ tập mới phải ở tương lai.', 400);
  }
  const previousTime = new Date(session.scheduledAt).getTime();
  const readStatus = session.status;
  Object.assign(session, changes);

  const { error } = await applyStatusChange(session, req.body.status, { cancelReason: req.body.cancelReason });
  if (error) return fail(res, error.message, error.status, error.data);

  // Claimed on the status it was read in: a session started meanwhile is not cancelled behind its back.
  const saved = await TrainingSession.findOneAndUpdate(
    { _id: session._id, status: readStatus },
    { $set: { ...changes, status: session.status, ...(session.cancelReason ? { cancelReason: session.cancelReason } : {}) } },
    { new: true }
  );
  if (!saved) return fail(res, 'Buổi tập vừa thay đổi trạng thái — tải lại rồi thử lại.', 409, { code: SESSION_ERROR.INVALID_TRANSITION });
  // A moved session moves the groom's feeding deadline with it.
  if (new Date(saved.scheduledAt).getTime() !== previousTime) {
    const horse = await Horse.findById(saved.horse).select('name');
    await announceSessionToGroom(saved, horse?.name || 'Ngựa');
  }
  await logAction({
    actorId: req.user._id,
    action: saved.status === SESSION_STATUS.CANCELLED && readStatus !== SESSION_STATUS.CANCELLED ? 'trainingSession.cancel' : 'trainingSession.update',
    targetModel: 'TrainingSession',
    targetId: saved._id,
    metadata: saved.cancelReason ? { reason: saved.cancelReason } : undefined,
  });
  return ok(res, saved, 'Training session updated.');
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
  const { readiness, error, carried } = await checkReadiness(
    session.horse,
    { scheduledAt: new Date(), intensity: session.intensity, sessionType: session.sessionType, objective: session.objective },
    overrideReason || undefined,
    session.readiness
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

  // Claiming by status starts once; matching time and pre-check rejects observations made before
  // a concurrent move or another pre-check.
  const started = await TrainingSession.findOneAndUpdate(
    { _id: session._id, status: SESSION_STATUS.READY, scheduledAt: session.scheduledAt, 'readiness.checkedAt': checkedAt },
    { $set: { status: SESSION_STATUS.IN_PROGRESS, actualStartAt: new Date(), startedBy: req.user._id, blockedReason: null, readiness: snapshot } },
    { new: true }
  );
  if (!started) {
    return fail(res, 'Buổi tập đã được bắt đầu hoặc không còn ở trạng thái sẵn sàng.', 409, {
      code: SESSION_ERROR.INVALID_TRANSITION,
      from: session.status,
      to: SESSION_STATUS.IN_PROGRESS,
    });
  }

  // A reason carried over from the pre-check was already reported to the Manager then.
  if (cautionGates(readiness).length > 0 && !carried) {
    await reportOverride({ session: started, readiness, reason: overrideReason, user: req.user, moment: 'start' });
  }
  await logAction({ actorId: req.user._id, action: 'trainingSession.start', targetModel: 'TrainingSession', targetId: session._id });
  return ok(res, started, 'Training session started.');
});

/** A medical block found at a decision point: the session is held back, the reason kept, the 409 sent. */
async function markBlocked(res, session, error, user, action, observed = {}) {
  const blocked = await TrainingSession.findOneAndUpdate(
    { _id: session._id, status: session.status, scheduledAt: session.scheduledAt },
    { $set: { status: SESSION_STATUS.BLOCKED, blockedReason: error.message, readiness: { ...toSnapshot(error.data.readiness, { userId: user._id }), ...observed } } },
    { new: true }
  );
  if (!blocked) return fail(res, 'Buổi tập đã thay đổi — tải lại trước khi kiểm tra.', 409, { code: SESSION_ERROR.INVALID_TRANSITION });
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
  if (bodyTempC !== undefined && bodyTempC >= PRECHECK_FEVER_C) return blockForFever(res, session, bodyTempC, req.user);
  // Judged at the booked time, not at the click: checked at 06:30 for 07:30, a 06:00 breakfast has
  // had its 90 minutes by the time the horse works. Checked late, "now" is the earliest it can run.
  const judgedAt = new Date(Math.max(Date.now(), new Date(session.scheduledAt).getTime()));
  const { readiness, error, carried } = await checkReadiness(
    session.horse,
    { scheduledAt: judgedAt, intensity: session.intensity, sessionType: session.sessionType, objective: session.objective },
    overrideReason || undefined,
    session.readiness
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

  const ready = await TrainingSession.findOneAndUpdate(
    { _id: session._id, status: session.status, scheduledAt: session.scheduledAt },
    { $set: { readiness: snapshot, status: SESSION_STATUS.READY }, $unset: { blockedReason: 1 } },
    { new: true }
  );
  if (!ready) return fail(res, 'Buổi tập đã thay đổi — tải lại trước khi kiểm tra.', 409, { code: SESSION_ERROR.INVALID_TRANSITION });

  const overridden = cautionGates(readiness).length > 0;
  // A reason carried over from the booking was already reported to the Manager then.
  if (overridden && !carried) await reportOverride({ session: ready, readiness, reason: overrideReason, user: req.user, moment: 'precheck' });
  await logAction({
    actorId: req.user._id,
    action: 'trainingSession.pre_check',
    targetModel: 'TrainingSession',
    targetId: session._id,
    metadata: { result: 'ready', overridden },
  });
  return ok(res, ready, 'Pre-check passed: the session is ready.');
});

/**
 * A fever found at the pre-check: whatever the other gates say, the horse does not train. The session
 * is held back with the temperature on record, and the vet gets a high-priority exam request unless
 * one is already waiting.
 */
async function blockForFever(res, session, bodyTempC, user) {
  const detail = `Thân nhiệt ${bodyTempC} °C — ngựa đang sốt (bình thường ${NORMAL_TEMP_RANGE}). Không tập; đã báo bác sĩ khám.`;
  const gates = await computeReadiness(session.horse, {
    scheduledAt: new Date(),
    intensity: session.intensity,
    sessionType: session.sessionType,
    objective: session.objective,
  });
  const readiness = { ...gates, overall: 'blocked', gates: [...gates.gates, { key: 'temperature', label: 'Thân nhiệt', status: 'blocked', detail }] };
  const horse = await Horse.findById(session.horse).select('name');
  if (horse && !(await ExamRequest.exists({ horse: session.horse, status: 'pending' }))) {
    await openExamRequest({
      horse,
      requestedBy: user,
      reason: `Sốt ${bodyTempC} °C khi kiểm tra trước buổi tập.`,
      priority: 'high',
      trainingSession: session._id,
      message: `🌡️ [ƯU TIÊN CAO] ${horse.name} sốt ${bodyTempC} °C khi kiểm tra trước buổi tập — buổi tập đã bị chặn, cần bác sĩ khám.`,
    });
  }
  return markBlocked(res, session, { message: detail, data: { readiness } }, user, 'trainingSession.pre_check', {
    bodyTempC,
    confirmedBy: user._id,
  });
}

const EVALUATION_FIELDS = ['performanceRating', 'trainerComment', 'videoUrl'];

/**
 * The trainer's evaluation of a run that was completed: rating, comment, video. It moves the session
 * to evaluated. What was measured is not part of it: that was recorded when the run closed. Filing it
 * again on an evaluated session is a correction, allowed, and the audit keeps the old values.
 */
const recordEvaluation = asyncHandler(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return undefined;
  if (![SESSION_STATUS.COMPLETED, SESSION_STATUS.EVALUATED].includes(session.status)) {
    return fail(res, `Chỉ đánh giá được buổi tập đã hoàn thành (buổi này đang "${SESSION_STATUS_LABELS[session.status] || session.status}").`, 409, {
      code: SESSION_ERROR.INVALID_TRANSITION,
      from: session.status,
      to: SESSION_STATUS.EVALUATED,
    });
  }
  if (req.body.metrics !== undefined || (req.body.status !== undefined && req.body.status !== SESSION_STATUS.EVALUATED)) {
    return fail(res, 'Đánh giá chỉ gồm điểm, nhận xét và video — số liệu đo được và trạng thái do lúc kết thúc buổi ghi.', 400);
  }

  const changes = {};
  const { performanceRating, trainerComment, videoUrl } = req.body;
  if (performanceRating !== undefined && performanceRating !== null && performanceRating !== '') {
    const rating = Number(performanceRating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) return fail(res, 'Điểm phong độ là số nguyên từ 1 đến 10.', 400);
    changes.performanceRating = rating;
  }
  if (trainerComment !== undefined) changes.trainerComment = String(trainerComment || '').trim();
  if (videoUrl !== undefined) {
    const link = String(videoUrl || '').trim();
    if (link && !/^https?:\/\/\S+$/i.test(link)) return fail(res, 'Link video phải là một địa chỉ http(s) hợp lệ.', 400);
    changes.videoUrl = link || null;
  }
  if (!Object.keys(changes).length) return fail(res, 'Nhập ít nhất điểm phong độ hoặc nhận xét.', 400);

  const before = Object.fromEntries(EVALUATION_FIELDS.map((f) => [f, session[f] ?? null]));
  const correction = session.status === SESSION_STATUS.EVALUATED;
  const saved = await TrainingSession.findOneAndUpdate(
    { _id: session._id, status: session.status },
    { $set: { ...changes, status: SESSION_STATUS.EVALUATED, evaluatedAt: new Date(), evaluatedBy: req.user._id } },
    { new: true }
  );
  if (!saved) return fail(res, 'Buổi tập vừa được người khác đánh giá — tải lại để xem.', 409, { code: SESSION_ERROR.INVALID_TRANSITION });

  await logAction({
    actorId: req.user._id,
    action: correction ? 'trainingSession.evaluation_corrected' : 'trainingSession.evaluate',
    targetModel: 'TrainingSession',
    targetId: saved._id,
    metadata: correction
      ? { before, after: Object.fromEntries(EVALUATION_FIELDS.map((f) => [f, saved[f] ?? null])) }
      : { rating: saved.performanceRating, outcome: saved.outcome?.met },
  });
  return ok(res, saved, correction ? 'Đã sửa đánh giá (lưu vết trong nhật ký).' : 'Session evaluation recorded.');
});

/**
 * The trainer ends a running session (the work is done, or the sensor feed isn't running). Measured
 * numbers may be typed only for a run the sensor never reported on.
 * POST /training/sessions/:id/end { metrics? }
 */
const endSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return undefined;
  if (session.status !== SESSION_STATUS.IN_PROGRESS) {
    return fail(res, `Chỉ kết thúc được buổi đang diễn ra (buổi này đang "${SESSION_STATUS_LABELS[session.status] || session.status}").`, 409, {
      code: SESSION_ERROR.INVALID_TRANSITION,
      from: session.status,
      to: SESSION_STATUS.COMPLETED,
    });
  }
  const { metrics } = req.body || {};
  if (metrics !== undefined && metrics !== null) {
    if (session.metrics?.sampleCount) return fail(res, 'Buổi này đã có số liệu cảm biến — không nhập tay đè lên được.', 400);
    const problem = rangeProblem(metrics, METRIC_RANGES);
    if (problem) return fail(res, problem, 400);
  }
  const closed = await closeRun(session._id, { to: SESSION_STATUS.COMPLETED, user: req.user, metrics: metrics || undefined });
  if (!closed) return fail(res, 'Buổi tập vừa kết thúc hoặc đã dừng — tải lại để xem kết quả.', 409, { code: SESSION_ERROR.INVALID_TRANSITION });
  return ok(res, closed, 'Training session ended.');
});

/**
 * The trainer stops a running session part-way. A reason and its category are required; what was
 * measured until then is kept, and the real end time recorded.
 * POST /training/sessions/:id/abort { category, reason }
 */
const abortSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return undefined;
  const category = req.body?.category;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!TRAINER_ABORT_CATEGORIES.includes(category)) {
    return fail(res, `Chọn nhóm nguyên nhân: ${TRAINER_ABORT_CATEGORIES.map((c) => ABORT_CATEGORY_LABELS[c]).join(', ')}.`, 400);
  }
  if (!reason) return fail(res, 'Ghi lý do dừng buổi tập.', 400);
  if (session.status !== SESSION_STATUS.IN_PROGRESS) {
    return fail(res, `Chỉ dừng được buổi đang diễn ra (buổi này đang "${SESSION_STATUS_LABELS[session.status] || session.status}").`, 409, {
      code: SESSION_ERROR.INVALID_TRANSITION,
      from: session.status,
      to: SESSION_STATUS.ABORTED,
    });
  }
  const closed = await closeRun(session._id, { to: SESSION_STATUS.ABORTED, user: req.user, abortCategory: category, abortReason: reason });
  if (!closed) return fail(res, 'Buổi tập vừa kết thúc hoặc đã dừng — tải lại để xem.', 409, { code: SESSION_ERROR.INVALID_TRANSITION });
  return ok(res, closed, 'Training session aborted.');
});

// A finished session is the record of work done and what came of it; only bookings that never
// happened can be removed.
const deleteSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return undefined;
  if (![SESSION_STATUS.SCHEDULED, SESSION_STATUS.CANCELLED].includes(session.status) || session.rescheduledTo) {
    return fail(res, 'Chỉ xoá được buổi tập còn "Đã lên lịch" hoặc đã hủy — buổi đã kiểm tra, đã chạy hay lỡ giờ là hồ sơ huấn luyện (hãy hủy thay vì xoá).', 409, {
      code: SESSION_ERROR.NOT_DELETABLE,
    });
  }
  await session.deleteOne();
  await logAction({ actorId: req.user._id, action: 'trainingSession.delete', targetModel: 'TrainingSession', targetId: session._id });
  return ok(res, null, 'Training session deleted.');
});

// What a booking is, without its outcome: copied when a missed session is booked again.
const BOOKING_FIELDS = ['kind', 'sessionType', 'objective', 'intensity', 'prescription', 'coachNote', 'assignedTo', 'trainingPlan', 'horse'];

/**
 * POST /training/sessions/:id/reschedule { scheduledAt } — books a missed session again at a new
 * time: a new scheduled session with the same work, the missed one kept as history and pointing to
 * it. Only for missed sessions; the vet's block still applies (checked again at the pre-check).
 */
const rescheduleSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return undefined;
  if (session.status !== SESSION_STATUS.MISSED) {
    return fail(res, 'Chỉ xếp lại được buổi đã lỡ giờ — buổi chưa chạy thì dùng "Đổi giờ".', 409, {
      code: SESSION_ERROR.INVALID_TRANSITION,
      from: session.status,
    });
  }
  if (session.rescheduledTo) return fail(res, 'Buổi này đã được xếp lại rồi.', 409);
  const scheduledAt = new Date(req.body?.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) return fail(res, 'Chọn giờ tập mới ở tương lai.', 400);

  const plan = await TrainingPlan.findById(session.trainingPlan).select('status');
  if (!plan || ['completed', 'cancelled'].includes(plan.status)) {
    return fail(res, 'Kế hoạch của buổi này đã kết thúc hoặc bị hủy — không xếp lại được.', 409);
  }
  const blocked = await getMedicalBlock(session.horse);
  if (blocked) return fail(res, `Không xếp lại được: ${blocked}`, 409);

  const booking = pick(session.toObject(), BOOKING_FIELDS);
  const next = new TrainingSession({ ...booking, scheduledAt, status: SESSION_STATUS.SCHEDULED, generated: false });
  // Reserve this booking before saving it: simultaneous requests must not both create a copy.
  const claimed = await TrainingSession.updateOne(
    { _id: session._id, status: SESSION_STATUS.MISSED, rescheduledTo: null },
    { $set: { rescheduledTo: next._id } }
  );
  if (!claimed.modifiedCount) return fail(res, 'Buổi này đã được xếp lại rồi.', 409);
  try {
    await next.save();
  } catch (err) {
    // A failed booking leaves the missed session available for another attempt. Only undo our claim.
    await TrainingSession.updateOne(
      { _id: session._id, rescheduledTo: next._id },
      { $set: { rescheduledTo: null } }
    );
    throw err;
  }

  await logAction({
    actorId: req.user._id,
    action: 'trainingSession.reschedule',
    targetModel: 'TrainingSession',
    targetId: session._id,
    metadata: { newSession: next._id, scheduledAt },
  });
  const horse = await Horse.findById(session.horse).select('name');
  await announceSessionToGroom(next, horse?.name || 'Ngựa');
  return created(res, next, 'Đã xếp lại buổi tập.');
});

module.exports = {
  rescheduleSession,
  listSessions,
  getSession,
  getReadiness,
  createSession,
  updateSession,
  startSession,
  preCheckSession,
  recordEvaluation,
  endSession,
  abortSession,
  deleteSession,
};
