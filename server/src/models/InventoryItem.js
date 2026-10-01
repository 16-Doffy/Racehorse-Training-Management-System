const mongoose = require('mongoose');

// Scaffold model: full CRUD is exposed, procurement workflow comes in a later phase.
// Keeps its own _id (unlike other embedded arrays in this file's siblings) because the
// approve/reject endpoint needs to address one specific request within the array.
const restockRequestSchema = new mongoose.Schema({
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  quantity: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  requestedAt: { type: Date, default: Date.now },
  note: { type: String, trim: true }, // why it is needed / for which horse
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true },
  // The task this request is holding up (a meal or dose the groom can't record without the stock).
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyTask', default: null },
});

const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, enum: ['feed', 'medicine', 'equipment'], required: true },
    quantity: { type: Number, required: true, default: 0 },
    unit: { type: String, required: true },
    stableBlock: { type: String },
    // A new item someone asked the Manager to start stocking. It becomes a regular item when the
    // Manager approves the request that came with it, and disappears if they turn it down.
    isProposed: { type: Boolean, default: false },
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    restockRequests: [restockRequestSchema],
    lowStockNotifiedAt: { type: Date, default: null }, // throttles the low-stock warning to once a day
  },
  { timestamps: true }
);

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
