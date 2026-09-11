const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    dosage: { type: String, required: true },
    frequency: { type: String },
  },
  { _id: false }
);

const treatmentSchema = new mongoose.Schema(
  {
    healthRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthRecord', required: true },
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    prescribedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    medications: [medicationSchema],
    // Emergency "lock training" order: while true, the training module refuses new sessions for this horse.
    isTrainingLocked: { type: Boolean, default: false },
    lockReason: { type: String },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    status: { type: String, enum: ['ongoing', 'completed'], default: 'ongoing' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Treatment', treatmentSchema);
