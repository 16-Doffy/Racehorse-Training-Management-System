const mongoose = require('mongoose');

const trainingPlanSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    phase: {
      type: String,
      enum: ['base_building', 'strength', 'speed', 'peak', 'recovery'],
      required: true,
    },
    distanceTarget: { type: Number, required: true }, // meters
    // "Khối lượng" — weekly training volume/load, so a plan captures more than just target
    // distance: how much work per week and how hard, alongside the surface it's run on.
    weeklyVolumeKm: { type: Number, required: true }, // total km of work planned per week
    intensity: { type: String, enum: ['light', 'moderate', 'high'], default: 'moderate' },
    surface: { type: String, enum: ['turf', 'dirt', 'synthetic', 'sand'], required: true },
    // What the whole plan is working towards. `phase` says where in the cycle the horse is;
    // these two say what the cycle is building for, so a plan reads as a sentence rather than
    // as a row of settings.
    goal: { type: String },
    targetRace: { type: mongoose.Schema.Types.ObjectId, ref: 'RaceEntry', default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    notes: { type: String },
    status: { type: String, enum: ['draft', 'active', 'completed', 'cancelled'], default: 'draft' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrainingPlan', trainingPlanSchema);
