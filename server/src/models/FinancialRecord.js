const mongoose = require('mongoose');

// Manual ledger entries and the revenue linked to a race result.
const financialRecordSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    type: { type: String, enum: ['cost', 'revenue'], required: true },
    category: { type: String, required: true }, // feed, medical, prize, sponsorship, ...
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    note: { type: String },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Typed in by the Manager, or written by the system (a race result's prize money). A system record is
    // corrected where it comes from (the race result), never edited by hand, so it can't be doubled.
    source: { type: String, enum: ['manual', 'race_prize', 'system'], default: 'manual' },
    raceEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'RaceEntry' },
  },
  { timestamps: true }
);

// Existing legacy rows without raceEntry remain valid; new prize rows are unique per entry.
financialRecordSchema.index({ raceEntry: 1 }, { unique: true, partialFilterExpression: { raceEntry: { $type: 'objectId' } } });

module.exports = mongoose.model('FinancialRecord', financialRecordSchema);
