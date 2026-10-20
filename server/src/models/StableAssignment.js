const mongoose = require('mongoose');

const stableAssignmentSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true, unique: true },
    stableBlock: { type: String, required: true }, // e.g. "Block A - Stall 12"; the stall's code when `stall` is set
    // The stall on the stable map. Older assignments have only the free-text `stableBlock`.
    stall: { type: mongoose.Schema.Types.ObjectId, ref: 'Stall', default: null },
    assignedCaretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One horse per stall on the map (free-text assignments without a stall are not part of it).
stableAssignmentSchema.index({ stall: 1 }, { unique: true, partialFilterExpression: { stall: { $type: 'objectId' } } });

module.exports = mongoose.model('StableAssignment', stableAssignmentSchema);
