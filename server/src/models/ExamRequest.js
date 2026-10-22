const mongoose = require('mongoose');
const { BODY_AREAS, EXAM_SYMPTOMS } = require('../constants/examRequest');

/**
 * A Head Trainer's or Manager's request for a vet to look at a horse.
 *
 * Requests used to exist only as notifications, so once the bell was cleared there was nothing
 * left to work from, and the trainer had no way to know whether anyone had acted on theirs. As a
 * record with a status, the vet has a queue and the requester can see it close — automatically,
 * when the vet files an exam for that horse.
 */
const examRequestSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, trim: true },
    priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
    // What the requester saw, so the vet comes prepared: the signs, where on the horse, since when,
    // and what was already done for it (cold hosing, the session stopped).
    symptoms: [{ type: String, enum: Object.keys(EXAM_SYMPTOMS) }],
    bodyAreas: [{ type: String, enum: Object.keys(BODY_AREAS) }],
    observedAt: { type: Date, default: null },
    firstAid: { type: String, trim: true },
    // The requester stops the horse's training until a vet has seen it: the medical gate blocks every
    // session while this request is open (readiness.service.js).
    holdTraining: { type: Boolean, default: false },
    // When the vet must have seen the horse by, from the priority (constants/examRequest.js).
    dueBy: { type: Date, default: null },
    status: { type: String, enum: ['pending', 'done', 'cancelled'], default: 'pending' },
    // A vet who has taken the request on, and when they will see the horse. The request stays
    // 'pending' (open) until the exam is filed, so every "open request" check keeps working.
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedAt: { type: Date, default: null },
    scheduledFor: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    // The exam that answered the request, when it was closed by one.
    healthRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthRecord', default: null },
    resolutionNote: { type: String },
    // The session it came from: picked by the requester, or set when the system raised the request
    // from a session's numbers (heart rate well past its limit, a fever at the pre-check).
    trainingSession: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingSession', default: null },
    // True when the system raised it; false when a person did (with or without a session). Older
    // requests have neither: those with a session were the system's.
    auto: { type: Boolean },
  },
  { timestamps: true }
);

examRequestSchema.index({ horse: 1, status: 1 });

module.exports = mongoose.model('ExamRequest', examRequestSchema);
