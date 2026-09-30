const mongoose = require('mongoose');

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
    status: { type: String, enum: ['pending', 'done', 'cancelled'], default: 'pending' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    // The exam that answered the request, when it was closed by one.
    healthRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthRecord', default: null },
    resolutionNote: { type: String },
    // Set when the request was raised by a session's numbers (heart rate well past its limit)
    // rather than typed by a person.
    trainingSession: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingSession', default: null },
  },
  { timestamps: true }
);

examRequestSchema.index({ horse: 1, status: 1 });

module.exports = mongoose.model('ExamRequest', examRequestSchema);
