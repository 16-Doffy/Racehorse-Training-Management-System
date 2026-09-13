const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema(
  {
    race: { type: String, required: true },
    result: { type: String, required: true }, // e.g. "1st", "2nd", "DNF"
    date: { type: Date, required: true },
  },
  { _id: false }
);

const horseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    breed: { type: String, trim: true },
    dob: { type: Date },
    color: { type: String, trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sire: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', default: null },
    dam: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', default: null },
    healthStatus: {
      type: String,
      enum: ['eligible', 'monitoring', 'injured', 'quarantined'],
      default: 'eligible',
    },
    weightKg: { type: Number },
    achievements: [achievementSchema],
    photoUrl: { type: String },
    // Recurring vet care due-dates. The care scheduler (realtime/careScheduler.js) checks these
    // against "now" and fires a Notification to the Veterinarian role when one falls due; each
    // *NotifiedAt field records the last time a reminder was actually sent, so the scheduler
    // doesn't spam a fresh notification every time it runs while a date is still overdue.
    careSchedule: {
      nextVaccinationDue: { type: Date, default: null },
      nextDewormingDue: { type: Date, default: null },
      nextFarrierDue: { type: Date, default: null },
      vaccinationNotifiedAt: { type: Date, default: null },
      dewormingNotifiedAt: { type: Date, default: null },
      farrierNotifiedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Horse', horseSchema);
