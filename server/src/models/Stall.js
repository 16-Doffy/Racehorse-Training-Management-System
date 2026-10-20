const mongoose = require('mongoose');

/**
 * A stall in the club's stable, kept by the Manager: the code on its nameplate ("A-03"), the zone it
 * belongs to and what it is for. A horse goes into a stall through StableAssignment, which keeps the
 * code in `stableBlock` as well, so every screen that already shows a stall name keeps working.
 */
const STALL_TYPES = ['standard', 'isolation', 'recovery'];
const STALL_STATUSES = ['active', 'maintenance'];
const ZONE_KEY = /^[A-Z0-9]{1,4}$/;

const stallSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 12 },
    zone: { type: String, required: true, trim: true, uppercase: true, match: ZONE_KEY },
    // How the zone is called on screen ("Khu A", "Khu cách ly") and what it is used for.
    zoneName: { type: String, trim: true, maxlength: 60 },
    zonePurpose: { type: String, trim: true, maxlength: 120 },
    type: { type: String, enum: STALL_TYPES, default: 'standard' },
    // Position in its zone: the map lays a zone out in two rows facing an aisle, in this order.
    order: { type: Number, default: 0 },
    status: { type: String, enum: STALL_STATUSES, default: 'active' },
    maintenanceNote: { type: String, trim: true, maxlength: 200 },
    maintenanceUntil: { type: Date, default: null },
    // A stall taken out of use leaves the map; its code stays reserved.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

stallSchema.index({ zone: 1, order: 1, code: 1 });

/**
 * Writes the stall first, inside the caller's transaction: placing a horse, maintenance and retiring
 * each check the stall and who stands in it, then write. Two such writes on one stall conflict, and
 * MongoDB re-runs the later transaction against what the first committed — so its checks see the new
 * state instead of both passing (a horse placed in a stall that went under maintenance meanwhile).
 * Returns the stall as it now is, or null.
 */
stallSchema.statics.claim = function claim(filter, session) {
  return this.findOneAndUpdate(filter, { $set: { updatedAt: new Date() } }, { new: true, session, timestamps: false });
};

module.exports = mongoose.model('Stall', stallSchema);
module.exports.STALL_TYPES = STALL_TYPES;
module.exports.STALL_STATUSES = STALL_STATUSES;
module.exports.ZONE_KEY = ZONE_KEY;
