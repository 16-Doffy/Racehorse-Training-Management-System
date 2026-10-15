const mongoose = require('mongoose');

const CARE_EVENT_KINDS = ['vaccination', 'deworming', 'farrier'];

/**
 * One time routine care was actually done: a vaccine shot, a deworming dose, a farrier visit.
 * Horse.careSchedule only holds the next due date (for the reminders); these are the history behind
 * it — what was given, from which batch, by whom — and filing one with `nextDue` moves the reminder.
 */
const careEventSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    kind: { type: String, enum: CARE_EVENT_KINDS, required: true },
    date: { type: Date, required: true },
    // The vaccine or dewormer (a farrier visit may leave it empty), its batch and the dose given.
    product: { type: String, trim: true, maxlength: 120 },
    batchNumber: { type: String, trim: true, maxlength: 60 },
    dose: { type: String, trim: true, maxlength: 60 },
    note: { type: String, trim: true, maxlength: 500 },
    nextDue: { type: Date, default: null },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

careEventSchema.index({ horse: 1, date: -1 });

module.exports = mongoose.model('CareEvent', careEventSchema);
module.exports.CARE_EVENT_KINDS = CARE_EVENT_KINDS;
