const mongoose = require('mongoose');

// Scaffold model: full CRUD is exposed, procurement workflow comes in a later phase.
// Keeps its own _id (unlike other embedded arrays in this file's siblings) because the
// approve/reject endpoint needs to address one specific request within the array.
const restockRequestSchema = new mongoose.Schema({
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  quantity: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  requestedAt: { type: Date, default: Date.now },
});

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
