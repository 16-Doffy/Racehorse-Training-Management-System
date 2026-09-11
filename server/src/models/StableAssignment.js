const mongoose = require('mongoose');

const stableAssignmentSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true, unique: true },
    stableBlock: { type: String, required: true }, // e.g. "Block A - Stall 12"
    assignedCaretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StableAssignment', stableAssignmentSchema);
