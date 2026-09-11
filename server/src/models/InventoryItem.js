const mongoose = require('mongoose');

// Scaffold model: full CRUD is exposed, procurement workflow comes in a later phase.
const restockRequestSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    quantity: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, enum: ['feed', 'medicine', 'equipment'], required: true },
    quantity: { type: Number, required: true, default: 0 },
    unit: { type: String, required: true },
    stableBlock: { type: String },
    restockRequests: [restockRequestSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
