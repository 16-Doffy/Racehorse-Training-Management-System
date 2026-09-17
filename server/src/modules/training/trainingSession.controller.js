const TrainingSession = require('../../models/TrainingSession');
const TrainingPlan = require('../../models/TrainingPlan');
const Treatment = require('../../models/Treatment');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');

const listSessions = asyncHandler(async (req, res) => {
  const { horse, trainingPlan, status, sessionType } = req.query;
  const filter = {};
  if (horse) filter.horse = horse;
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

// This is where the Veterinarian's emergency "lock training" order takes effect: a horse under
// an active isTrainingLocked treatment cannot be scheduled for a new session.
const createSession = asyncHandler(async (req, res) => {
  const { trainingPlan: planId, horse } = req.body;

  const plan = await TrainingPlan.findById(planId);
  if (!plan) return fail(res, 'Training plan not found.', 404);

  const Horse = require('../../models/Horse');
  const activeLock = await Treatment.findOne({ horse, isTrainingLocked: true, status: 'ongoing' });
  const targetHorse = await Horse.findById(horse);

  if (!targetHorse) return fail(res, 'Horse not found.', 404);

  const isInjuredOrQuarantined = targetHorse.healthStatus === 'injured' || targetHorse.healthStatus === 'quarantined';

  if (activeLock || isInjuredOrQuarantined) {
    const reason = activeLock?.lockReason || `bệnh lý y tế (${targetHorse.healthStatus === 'injured' ? 'chấn thương' : 'cách ly'})`;
    return fail(
      res,
      `Không thể tạo buổi tập: Chiến mã đang trong trạng thái bị khóa huấn luyện do y tế (${reason}).`,
      409
    );
  }

  const session = await TrainingSession.create(req.body);
  await logAction({ actorId: req.user._id, action: 'trainingSession.create', targetModel: 'TrainingSession', targetId: session._id });
  return created(res, session, 'Training session created.');
});

const updateSession = asyncHandler(async (req, res) => {
  const session = await TrainingSession.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!session) return fail(res, 'Training session not found.', 404);
  await logAction({ actorId: req.user._id, action: 'trainingSession.update', targetModel: 'TrainingSession', targetId: session._id });
  return ok(res, session, 'Training session updated.');
});

// Trainer's post-session evaluation: performance rating + professional comment on the session log.
const recordEvaluation = asyncHandler(async (req, res) => {
  const { trainerComment, performanceRating, metrics, status } = req.body;
  const session = await TrainingSession.findById(req.params.id);
  if (!session) return fail(res, 'Training session not found.', 404);

  if (trainerComment !== undefined) session.trainerComment = trainerComment;
  if (performanceRating !== undefined) session.performanceRating = performanceRating;
  if (metrics !== undefined) session.metrics = { ...session.metrics.toObject(), ...metrics };
  if (status !== undefined) session.status = status;

  await session.save();
  return ok(res, session, 'Session evaluation recorded.');
});

const deleteSession = asyncHandler(async (req, res) => {
  const session = await TrainingSession.findByIdAndDelete(req.params.id);
  if (!session) return fail(res, 'Training session not found.', 404);
  return ok(res, null, 'Training session deleted.');
});

module.exports = { listSessions, getSession, createSession, updateSession, recordEvaluation, deleteSession };
