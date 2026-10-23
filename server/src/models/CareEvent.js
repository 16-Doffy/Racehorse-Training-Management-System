const mongoose = require('mongoose');
const { CARE_ROUTES, FARRIER_WORK, HOOF_CONDITIONS, LIMBS, REACTIONS, SHOT_TYPES, VACCINE_TARGETS } = require('../constants/careEvent');

const CARE_EVENT_KINDS = ['vaccination', 'deworming', 'farrier'];
const keys = (vocabulary) => Object.keys(vocabulary);

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
    // The details of each kind (constants/careEvent.js DETAIL_FIELDS), all optional.
    // A vaccine: the diseases it covers, which shot of the course, how and where, the batch's expiry,
    // and how the horse took it.
    targets: [{ type: String, enum: keys(VACCINE_TARGETS) }],
    shotType: { type: String, enum: [...keys(SHOT_TYPES), null], default: null },
    route: { type: String, enum: [...keys(CARE_ROUTES), null], default: null },
    site: { type: String, trim: true, maxlength: 60 },
    lotExpiry: { type: Date, default: null },
    reaction: { type: String, enum: [...keys(REACTIONS), null], default: null },
    // A dewormer: its active ingredient, the weight the dose was worked out for, and the faecal egg
    // count (eggs per gram) that called for it.
    activeIngredient: { type: String, trim: true, maxlength: 80 },
    weightKg: { type: Number, min: 0 },
    fecEpg: { type: Number, min: 0 },
    // A farrier visit: who, what was done, to which feet, and how the hooves were.
    farrierName: { type: String, trim: true, maxlength: 80 },
    work: [{ type: String, enum: keys(FARRIER_WORK) }],
    limbs: [{ type: String, enum: keys(LIMBS) }],
    hoofCondition: [{ type: String, enum: keys(HOOF_CONDITIONS) }],
    nextDue: { type: Date, default: null },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

careEventSchema.index({ horse: 1, date: -1 });

module.exports = mongoose.model('CareEvent', careEventSchema);
module.exports.CARE_EVENT_KINDS = CARE_EVENT_KINDS;
