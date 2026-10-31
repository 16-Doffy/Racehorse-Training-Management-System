const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  name: { type: String, required: true },
  amount: { type: Number, required: true, min: 0.01 },
  unit: { type: String, required: true },
}, { _id: false });

const mealSchema = new mongoose.Schema({
  slot: { type: String, enum: ['morning', 'noon', 'evening'], required: true },
  time: { type: String, required: true },
  items: { type: [itemSchema], required: true },
  edited: { type: Boolean, default: false },
}, { _id: false });

// One approved day of a horse's training cycle. The date is the club's YYYY-MM-DD, not UTC's day.
const schema = new mongoose.Schema({
  horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingPlan', required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  phase: { type: String, required: true },
  work: { type: String, enum: ['rest', 'light', 'moderate', 'high'], required: true },
  meals: { type: [mealSchema], required: true },
  // The meals the trainer chose not to give that day, so confirming the plan again does not bring them back.
  removedSlots: { type: [{ type: String, enum: ['morning', 'noon', 'evening'] }], default: [] },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedPlanUpdatedAt: { type: Date, required: true },
}, { timestamps: true });

schema.index({ horse: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('FeedingCalendarDay', schema);
