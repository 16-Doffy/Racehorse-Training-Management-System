const mongoose = require('mongoose');

// Scaffold model: full CRUD is exposed, aggregated cost/revenue reports come in a later phase.
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('FinancialRecord', financialRecordSchema);
