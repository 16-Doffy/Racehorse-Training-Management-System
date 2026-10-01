const mongoose = require('mongoose');

const CODE_PREFIX = { feed: 'TA', medicine: 'YT', equipment: 'DC' };

// Keeps its own _id (unlike other embedded arrays in this file's siblings) because the
// approve/reject endpoint needs to address one specific request within the array.
const restockRequestSchema = new mongoose.Schema({
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  quantity: { type: Number, required: true }, // in the item's unit (a pack request is converted)
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  requestedAt: { type: Date, default: Date.now },
  note: { type: String, trim: true }, // why it is needed / for which horse
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true },
  // The task this request is holding up (a meal or dose the groom can't record without the stock).
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyTask', default: null },
});

/**
 * One stock item. Deliberately small: everything the club needs to plan and use stock, nothing
 * that can be worked out instead — the status (in stock / low / out / expiring / discontinued)
 * is computed, and the last time stock came in is recorded by the system (lastRestockedAt).
 */
const inventoryItemSchema = new mongoose.Schema(
  {
    // Short code shown on lists and labels: TA-001 (food), YT-001 (medical), DC-001 (equipment).
    code: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: ['feed', 'medicine', 'equipment'], required: true },
    description: { type: String, trim: true }, // what it is for
    // The unit it is used and counted in: rations, doses and stock all use it (kg, g, ml, viên…).
    unit: { type: String, required: true, trim: true },
    // How it is bought, optional: "1 bao = 25 kg". Lets stock be received and requested by the pack.
    packUnit: { type: String, trim: true },
    packSize: { type: Number, min: 0 },
    quantity: { type: Number, required: true, default: 0 },
    // Minimum stock: at or below it the item counts as low and the Manager is warned.
    reorderLevel: { type: Number, min: 0, default: 0 },
    // Reference price of one purchase unit (a pack if packUnit is set, otherwise one unit), VND.
    price: { type: Number, min: 0 },
    expiryDate: { type: Date, default: null }, // nearest expiry, for food and medicine
    // Area it belongs to ("Block A"); empty = shared stock for every area.
    stableBlock: { type: String, trim: true },
    // Discontinued items stay on record but can't be put into new rations or prescriptions.
    isActive: { type: Boolean, default: true },
    lastRestockedAt: { type: Date, default: null },
    // A new item someone asked the Manager to start stocking. It becomes a regular item when the
    // Manager approves the request that came with it, and disappears if they turn it down.
    isProposed: { type: Boolean, default: false },
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    restockRequests: [restockRequestSchema],
    lowStockNotifiedAt: { type: Date, default: null }, // throttles the low-stock warning to once a day
  },
  { timestamps: true }
);

// Gives a new item the next code of its category (TA-007…).
inventoryItemSchema.pre('validate', async function assignCode() {
  if (this.code || !CODE_PREFIX[this.category]) return;
  const prefix = CODE_PREFIX[this.category];
  const last = await this.constructor.find({ code: new RegExp(`^${prefix}-\\d+$`) }).select('code').lean();
  const max = last.reduce((m, d) => Math.max(m, parseInt(d.code.split('-')[1], 10) || 0), 0);
  this.code = `${prefix}-${String(max + 1).padStart(3, '0')}`;
});

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
