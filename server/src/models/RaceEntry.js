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
  },
  { timestamps: true }
);

module.exports = mongoose.model('RaceEntry', raceEntrySchema);
