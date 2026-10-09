const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    dosage: { type: String, required: true },
    frequency: { type: String },
    // Optional link to the medicine in stock, the amount per dose in that item's unit (giving the
    // dose takes it out of stock), and the times of day it is given ("08:00", "20:00").
    inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null },
    amount: { type: Number, min: 0 },
    times: [{ type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ }],
    timeSlots: [{ type: String }], // e.g. ['morning', 'noon', 'afternoon', 'evening']
    specificTimes: { type: String }, // e.g. "08:00, 16:00"
    startDate: { type: Date },
    endDate: { type: Date },
    instructions: { type: String },
    prescribedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['ongoing', 'completed', 'cancelled'], default: 'ongoing' },
  },
  { _id: false }
);

const treatmentSchema = new mongoose.Schema(
  {
    healthRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthRecord', required: true },
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    prescribedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    medications: [medicationSchema],
    // What the stable has to do for this horse while it is being treated (box rest, no hard feed,
    // watch the swelling). Together with the medications this becomes the groom's daily care tasks.
    careInstructions: { type: String, trim: true },
    // Emergency "lock training" order: while true, the training module refuses new sessions for this horse.
    isTrainingLocked: { type: Boolean, default: false },
    // How hard the horse may work while this treatment is ongoing: none (= the training lock),
    // light, moderate, high (no restriction). The vet raises it as the horse recovers. Kept in step
    // with isTrainingLocked; older records without it are read from the flag (trainingClearance.js).
    trainingLevel: { type: String, enum: ['none', 'light', 'moderate', 'high'] },
    lockReason: { type: String },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    status: { type: String, enum: ['ongoing', 'completed'], default: 'ongoing' },
    // Set when the treatment ended while it still restricted training: the level the horse stays at until
    // a vet assesses it for a return to training (a HealthRecord with clearedLevel). Ending a treatment is
    // not the same as being cleared to train again.
    returnLevel: { type: String, enum: ['none', 'light', 'moderate', 'high', null], default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Treatment', treatmentSchema);
