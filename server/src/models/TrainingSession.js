const mongoose = require('mongoose');

const trainingSessionSchema = new mongoose.Schema(
  {
    trainingPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingPlan', required: true },
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // caretaker/trainer running the session
    scheduledAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    metrics: {
      avgHeartRate: { type: Number },
      maxHeartRate: { type: Number },
      maxSpeed: { type: Number }, // km/h
      distance: { type: Number }, // meters
    },
    trainerComment: { type: String },
    performanceRating: { type: Number, min: 1, max: 10 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrainingSession', trainingSessionSchema);
