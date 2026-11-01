const mongoose = require('mongoose');

const stableAssignmentSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true, unique: true },
    stableBlock: { type: String, required: true }, // e.g. "Block A - Stall 12"; the stall's code when `stall` is set
    // The stall on the stable map. Older assignments have only the free-text `stableBlock`.
    stall: { type: mongoose.Schema.Types.ObjectId, ref: 'Stall', default: null },
    assignedCaretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // The horse's own ordinary stall, kept for it while it is in an isolation or recovery stall: nobody
    // else is placed there, and the horse goes back to it once fit (stable/healthPlacement.service.js).
    homeStall: { type: mongoose.Schema.Types.ObjectId, ref: 'Stall', default: null },
    // The kind of stall the horse's health asks for when none was free: tried again every hour.
    pendingMove: { type: String, enum: ['isolation', 'recovery', 'standard', null], default: null },
  },
  { timestamps: true }
);

// One horse per stall on the map (free-text assignments without a stall are not part of it).
stableAssignmentSchema.index({ stall: 1 }, { unique: true, partialFilterExpression: { stall: { $type: 'objectId' } } });

module.exports = mongoose.model('StableAssignment', stableAssignmentSchema);
