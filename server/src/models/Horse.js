const mongoose = require('mongoose');

// stallion/mare: adult; gelding: castrated male; colt/filly: young male/female (under 4).
const HORSE_SEXES = ['stallion', 'mare', 'gelding', 'colt', 'filly'];
const blankToUndefined = (v) => (v === '' || v === null ? undefined : v);

const achievementSchema = new mongoose.Schema(
  {
    // Stable identity of this horse's race entry; names can repeat between editions.
    raceEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'RaceEntry', default: null },
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
    // Which Head Trainer/Veterinarian is responsible for this horse. Scoping is strict (see
    // horseScope.js): until the Manager assigns one, no trainer or vet can see the horse at all.
    assignedTrainer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedVet: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // No longer managed by the club (sold, retired, moved) but with records worth keeping, so it
    // can't simply be deleted. Hidden from the working lists; the Manager can bring it back.
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    archivedReason: { type: String, trim: true },
    healthStatus: {
      type: String,
      enum: ['eligible', 'monitoring', 'injured', 'quarantined'],
      default: 'eligible',
    },
    weightKg: { type: Number },
    // Identity papers, kept by the Manager: sex, the implanted microchip and the stud-book number.
    sex: { type: String, enum: HORSE_SEXES, set: blankToUndefined },
    microchipNumber: {
      type: String,
      trim: true,
      uppercase: true,
      set: blankToUndefined,
      match: [/^[A-Z0-9]{9,15}$/, 'Số vi mạch gồm 9–15 chữ số hoặc chữ cái.'],
    },
    registrationNumber: { type: String, trim: true, maxlength: 40, set: blankToUndefined },
    // What the horse is worth (VND), set by the Manager. Only the Manager and the owner see it
    // (horses.controller.js hideValuation).
    valuationVnd: { type: Number, min: [0, 'Định giá không được âm.'], default: null },
    valuationUpdatedAt: { type: Date, default: null },
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
      nextExamDue: { type: Date, default: null },
      vaccinationNotifiedAt: { type: Date, default: null },
      dewormingNotifiedAt: { type: Date, default: null },
      farrierNotifiedAt: { type: Date, default: null },
      examNotifiedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// One horse per microchip; horses without one are not compared.
horseSchema.index({ microchipNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Horse', horseSchema);
module.exports.HORSE_SEXES = HORSE_SEXES;
