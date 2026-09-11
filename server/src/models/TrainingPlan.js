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
    surface: { type: String, enum: ['turf', 'dirt', 'synthetic', 'sand'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    notes: { type: String },
    status: { type: String, enum: ['draft', 'active', 'completed', 'cancelled'], default: 'draft' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrainingPlan', trainingPlanSchema);
