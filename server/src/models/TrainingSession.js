const mongoose = require('mongoose');

const trainingSessionSchema = new mongoose.Schema(
  {
    trainingPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingPlan', required: true },
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // caretaker/trainer running the session
    // Distinguishes a normal training rep from an official timed trial run (used to pick which
    // horse gets entered for an upcoming race) — same lifecycle/metrics, different intent.
    sessionType: { type: String, enum: ['training', 'trial_run'], default: 'training' },
    // What the session is FOR. sessionType only says "normal rep vs. timed trial"; this says what
    // the horse is meant to gain from the work, which is what decides distance, pace and recovery.
    objective: {
      type: String,
      enum: ['endurance', 'speed', 'interval', 'recovery', 'technique', 'race_simulation'],
      default: 'endurance',
    },
    // Per-session intensity. TrainingPlan.intensity is only the plan's default: even a "speed"
    // phase alternates hard days with easy ones, so a session has to be able to differ from it.
    intensity: { type: String, enum: ['light', 'moderate', 'high'], default: 'moderate' },
    // The workout as prescribed beforehand, which `metrics` is then measured against.
    prescription: {
      distanceM: { type: Number },
      reps: { type: Number },
      restMinutes: { type: Number },
      targetSpeedKmh: { type: Number },
      targetHeartRateMax: { type: Number },
      durationMinutes: { type: Number },
    },
    coachNote: { type: String }, // briefing BEFORE the session (trainerComment is the debrief after)
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
    // Snapshot of the readiness gates at the moment the session was created/started. Kept on the
    // session rather than recomputed on read, because the point of the record is what was known
    // at the time the decision was made — a horse fed late today doesn't retroactively make last
    // week's session reckless.
    readiness: {
      checkedAt: { type: Date },
      overall: { type: String, enum: ['ready', 'caution', 'blocked'] },
      gates: [
        {
          key: { type: String },
          status: { type: String },
          detail: { type: String },
          _id: false,
        },
      ],
      overrideReason: { type: String },
      overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    // Actual vs. prescribed, computed when the trainer files the evaluation.
    outcome: {
      met: { type: Boolean, default: null },
      summary: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrainingSession', trainingSessionSchema);
