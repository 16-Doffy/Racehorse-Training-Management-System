const mongoose = require('mongoose');

// Same surfaces as a training plan, so a plan aimed at a race can take the race's surface.
const SURFACES = ['turf', 'dirt', 'synthetic', 'sand'];

const raceEntrySchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    raceName: { type: String, required: true },
    raceDate: { type: Date, required: true },
    distance: { type: Number },
    venue: { type: String, trim: true }, // the racecourse, e.g. "Trường đua Đại Nam"
    surface: { type: String, enum: SURFACES },
    status: {
      type: String,
      enum: ['registered', 'confirmed', 'completed', 'withdrawn'],
      default: 'registered',
    },
    result: { type: String },
    position: { type: Number, min: 1 }, // finishing place
    finishTime: { type: String, trim: true }, // e.g. "1:12.45"
    prizeMoney: { type: Number, min: 0, default: 0 },
    // The trainer's decision whether the horse goes, apart from the trial result it may rest on: who, when,
    // on which trial (or an exception with its reason when there was none), and why.
    decision: {
      status: { type: String, enum: ['confirmed', 'withdrawn'] },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date },
      trialSession: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingSession', default: null },
      trialMet: { type: Boolean, default: null },
      exception: { type: Boolean, default: false }, // confirmed without a trial that was run
      reason: { type: String, trim: true },
    },
    // Set when the horse's health changed after it was confirmed; cleared by a new decision.
    reviewNeeded: { type: Boolean, default: false },
    reviewReason: { type: String },
    reviewFlaggedAt: { type: Date },
    // The revenue entry the prize money became, so editing the result updates it instead of adding another.
    financeRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialRecord', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RaceEntry', raceEntrySchema);
module.exports.SURFACES = SURFACES;
