const mongoose = require('mongoose');

const ROUTES = ['oral', 'im', 'iv', 'sc', 'topical', 'eye', 'other'];
const LEVELS = ['none', 'light', 'moderate', 'high'];

// One medicine of a template, as the prescription form fills it in: the medicine (linked to the
// club's medicine list when it is on it), the dose each time, how it is given, at what times and for
// how many days.
const templateMedicationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null },
    amount: { type: Number, min: 0 },
    unit: { type: String, trim: true },
    dosage: { type: String, trim: true },
    route: { type: String, enum: [...ROUTES, null], default: null },
    times: [{ type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ }],
    days: { type: Number, min: 1, max: 90 },
    instructions: { type: String, trim: true },
  },
  { _id: false }
);

/**
 * A vet's ready-made prescription for a condition ("Viêm gân", "Đau bụng nhẹ"): picked in the
 * prescription form, it fills in the medicines, the care orders and the training level, which the
 * vet then adjusts for the horse. Every vet sees every template; only its author changes or deletes it.
 */
const prescriptionTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    condition: { type: String, trim: true, maxlength: 160 },
    days: { type: Number, min: 1, max: 90 },
    trainingLevel: { type: String, enum: LEVELS, default: 'high' },
    lockReason: { type: String, trim: true, maxlength: 300 },
    careInstructions: { type: String, trim: true, maxlength: 600 },
    medications: [templateMedicationSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

prescriptionTemplateSchema.index({ createdBy: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('PrescriptionTemplate', prescriptionTemplateSchema);
module.exports.TEMPLATE_ROUTES = ROUTES;
module.exports.TEMPLATE_LEVELS = LEVELS;
