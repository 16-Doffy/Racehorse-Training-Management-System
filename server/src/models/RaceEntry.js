const mongoose = require('mongoose');

// Scaffold model: full CRUD is exposed, results/leaderboard integration comes in a later phase.
const raceEntrySchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    raceName: { type: String, required: true },
    raceDate: { type: Date, required: true },
    distance: { type: Number },
    status: {
      type: String,
      enum: ['registered', 'confirmed', 'completed', 'withdrawn'],
      default: 'registered',
    },
    result: { type: String },
    position: { type: Number, min: 1 }, // finishing place
    finishTime: { type: String, trim: true }, // e.g. "1:12.45"
    prizeMoney: { type: Number, min: 0, default: 0 },
    // The revenue entry the prize money became, so editing the result updates it instead of adding another.
    financeRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialRecord', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RaceEntry', raceEntrySchema);
