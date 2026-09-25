const TrainingSession = require('../../models/TrainingSession');
const TrainingPlan = require('../../models/TrainingPlan');
const Treatment = require('../../models/Treatment');
const Horse = require('../../models/Horse');
const DailyTask = require('../../models/DailyTask');
const StableAssignment = require('../../models/StableAssignment');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { getScopedHorseIds, isHorseInScope } = require('../../utils/horseScope');
const { pushNotification } = require('../alerts/notification.service');
const { computeReadiness, cautionGates } = require('./readiness.service');
const { OBJECTIVE_LABELS } = require('../../constants/training');
const { ROLES } = require('../../constants/roles');

const listSessions = asyncHandler(async (req, res) => {
  const { horse, trainingPlan, status, sessionType } = req.query;
  const scopedIds = await getScopedHorseIds(req.user);
  const filter = {};
  if (horse) {
    filter.horse = isHorseInScope(scopedIds, horse) ? horse : { $in: [] };
  } else if (scopedIds) {
    filter.horse = { $in: scopedIds };
  }
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
  const session = await TrainingSession.findById(req.params.id)
    .populate('horse')
    .populate('trainingPlan')
    .populate('assignedTo', 'name');
  if (!session) return fail(res, 'Training session not found.', 404);
  return ok(res, session, 'Training session fetched.');
});

/**
 * The readiness board: four gates, each owned by a different role (see readiness.service.js).
 * Exposed as its own endpoint so the trainer's scheduling form can show it live while they pick a
 * horse and a time — and so the vet's, groom's and owner's screens can render the same answer
 * without duplicating the rules.
 */
const getReadiness = asyncHandler(async (req, res) => {
  const { horse, scheduledAt, intensity, sessionType, objective } = req.query;
  if (!horse) return fail(res, 'horse is required.', 400);

  const scopedIds = await getScopedHorseIds(req.user);
  if (!isHorseInScope(scopedIds, horse)) {
    return fail(res, 'Forbidden: this horse is not assigned to you.', 403);
  }

  const readiness = await computeReadiness(horse, { scheduledAt, intensity, sessionType, objective });
  if (!readiness) return fail(res, 'Horse not found.', 404);

  return ok(res, readiness, 'Readiness computed.');
});

// This is where the Veterinarian's emergency "lock training" order takes effect: a horse under
// an active isTrainingLocked treatment cannot be scheduled for a new session. Since the readiness
// service now covers that same medical rule plus three others, the check runs through it.
const createSession = asyncHandler(async (req, res) => {
  const { trainingPlan: planId, horse, scheduledAt, intensity, sessionType, objective, overrideReason } = req.body;

  const scopedIds = await getScopedHorseIds(req.user);
  if (!isHorseInScope(scopedIds, horse)) {
    return fail(res, 'Forbidden: this horse is not assigned to you.', 403);
  }

  const plan = await TrainingPlan.findById(planId);
  if (!plan) return fail(res, 'Training plan not found.', 404);

  const readiness = await computeReadiness(horse, { scheduledAt, intensity, sessionType, objective });
  if (!readiness) return fail(res, 'Horse not found.', 404);

  // A vet's lock is not the trainer's call — no override exists for it.
  const blocked = readiness.gates.find((g) => g.status === 'blocked');
  if (blocked) {
    return fail(res, `Không thể tạo buổi tập: ${blocked.detail}`, 409, { readiness });
  }

  // Everything else is advisory: the trainer decides, but has to say why on the record.
  const cautions = cautionGates(readiness);
  if (cautions.length > 0 && !overrideReason) {
    return fail(
      res,
      `Buổi tập này có ${cautions.length} cảnh báo cần xác nhận trước khi tạo.`,
      409,
      { readiness, requiresOverride: true }
    );
  }

  const session = await TrainingSession.create({
    ...req.body,
    readiness: {
      checkedAt: new Date(),
      overall: readiness.overall,
      gates: readiness.gates.map((g) => ({ key: g.key, status: g.status, detail: g.detail })),
      overrideReason: cautions.length > 0 ? overrideReason : undefined,
      overriddenBy: cautions.length > 0 ? req.user._id : undefined,
    },
  });

  await logAction({ actorId: req.user._id, action: 'trainingSession.create', targetModel: 'TrainingSession', targetId: session._id });

  if (cautions.length > 0) {
    // The manager owns club-level oversight, so an override is reported upward rather than just
    // buried in the audit log where nobody looks.
    const horseDoc = await Horse.findById(horse).select('name');
    await logAction({
      actorId: req.user._id,
      action: 'trainingSession.readiness_override',
      targetModel: 'TrainingSession',
      targetId: session._id,
      metadata: { reason: overrideReason, gates: cautions.map((g) => g.key) },
    });
    await pushNotification({
      recipientRole: ROLES.MANAGER,
      horse,
      trainingSession: session._id,
      type: 'readiness_override',
      severity: 'warning',
      message: `⚠️ ${req.user.name} vẫn xếp buổi tập cho ${horseDoc?.name || 'ngựa'} dù có ${cautions.length} cảnh báo (${cautions
        .map((g) => g.label)
        .join(', ')}). Lý do: ${overrideReason}`,
    });
  }

  return created(res, session, 'Training session created.');
});

const updateSession = asyncHandler(async (req, res) => {
  const existing = await TrainingSession.findById(req.params.id);
  if (!existing) return fail(res, 'Training session not found.', 404);

  // Starting a session is a second decision point, not a formality: a horse can be perfectly fine
  // when the session is booked on Monday and locked by the vet on Wednesday. Without this, an
  // already-scheduled session could still be flipped to in_progress and re-arm the sensor feed
  // for a horse the vet had grounded.
  if (req.body.status === 'in_progress' && existing.status !== 'in_progress') {
    const activeLock = await Treatment.findOne({ horse: existing.horse, isTrainingLocked: true, status: 'ongoing' });
    const horse = await Horse.findById(existing.horse).select('healthStatus');
    const grounded = horse && (horse.healthStatus === 'injured' || horse.healthStatus === 'quarantined');

    if (activeLock || grounded) {
      const reason = activeLock?.lockReason || `tình trạng sức khỏe (${horse.healthStatus === 'injured' ? 'chấn thương' : 'cách ly'})`;
      return fail(res, `Không thể bắt đầu buổi tập: chiến mã đang bị khóa huấn luyện do y tế (${reason}).`, 409);
    }
  }

  const session = await TrainingSession.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  await logAction({ actorId: req.user._id, action: 'trainingSession.update', targetModel: 'TrainingSession', targetId: session._id });
  return ok(res, session, 'Training session updated.');
});

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

/**
 * A hard session leaves a horse that needs cooling down and its legs iced, and the person who does
 * that is the groom, not the trainer. Rather than relying on the trainer to remember to assign it,
 * finishing the session creates the work.
 */
async function createPostSessionCare(session) {
  const isHard = session.intensity === 'high' || session.objective === 'race_simulation';
  if (!isHard) return 0;

  const assignment = await StableAssignment.findOne({ horse: session.horse });
  if (!assignment?.assignedCaretaker) return 0;

  const objectiveLabel = OBJECTIVE_LABELS[session.objective] || 'buổi tập';
  const distance = session.prescription?.distanceM ? ` ${session.prescription.distanceM}m` : '';

  const wanted = [
    { taskType: 'icing', note: `Sau buổi ${objectiveLabel.toLowerCase()}${distance} — ngâm chân hạ nhiệt gân.` },
    { taskType: 'bathing', note: `Sau buổi ${objectiveLabel.toLowerCase()}${distance} — tắm và lau khô.` },
  ];

  let createdCount = 0;
  for (const item of wanted) {
    // Idempotent per session, so re-filing an evaluation doesn't pile up duplicate chores.
    // eslint-disable-next-line no-await-in-loop
    const exists = await DailyTask.findOne({
      horse: session.horse,
      taskType: item.taskType,
      trainingSession: session._id,
    });
    if (exists) continue;

    // eslint-disable-next-line no-await-in-loop
    await DailyTask.create({
      horse: session.horse,
      assignedTo: assignment.assignedCaretaker,
      taskType: item.taskType,
      trainingSession: session._id,
      note: item.note,
      scheduledDate: new Date(),
      status: 'pending',
    });
    createdCount += 1;
  }

  return createdCount;
}

// Trainer's post-session evaluation: performance rating + professional comment on the session log.
const recordEvaluation = asyncHandler(async (req, res) => {
  const { trainerComment, performanceRating, metrics, status } = req.body;
  const session = await TrainingSession.findById(req.params.id);
  if (!session) return fail(res, 'Training session not found.', 404);

  const wasCompleted = session.status === 'completed';

  if (trainerComment !== undefined) session.trainerComment = trainerComment;
  if (performanceRating !== undefined) session.performanceRating = performanceRating;
  if (metrics !== undefined) session.metrics = { ...session.metrics.toObject(), ...metrics };
  if (status !== undefined) session.status = status;

  session.outcome = computeOutcome(session);
  await session.save();

  let careTasksCreated = 0;
  if (session.status === 'completed' && !wasCompleted) {
    careTasksCreated = await createPostSessionCare(session);

    // The owner pays for this horse and never sees the training screens — closing the loop back to
    // them is the difference between "my horse trains somewhere" and knowing how it went.
    const horse = await Horse.findById(session.horse).select('name owner');
    if (horse?.owner) {
      const verdict = session.outcome.met === null ? '' : ` ${session.outcome.summary}`;
      await pushNotification({
        recipientUser: horse.owner,
        horse: horse._id,
        trainingSession: session._id,
        type: 'session_completed',
        severity: 'info',
        message: `🏇 ${horse.name} đã hoàn thành buổi tập "${OBJECTIVE_LABELS[session.objective] || 'huấn luyện'}".${verdict}`,
      });
    }
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

const deleteSession = asyncHandler(async (req, res) => {
  const session = await TrainingSession.findByIdAndDelete(req.params.id);
  if (!session) return fail(res, 'Training session not found.', 404);
  return ok(res, null, 'Training session deleted.');
});

module.exports = { listSessions, getSession, getReadiness, createSession, updateSession, recordEvaluation, deleteSession };
