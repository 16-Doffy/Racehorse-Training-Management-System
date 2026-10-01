const mongoose = require('mongoose');

// Scaffold model: full CRUD is exposed, detailed nutrition planning UI comes in a later phase.
const feedingItemSchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // the item's name (older rations: grain, hay, ...)
    quantity: { type: String, required: true }, // display text, e.g. "2.5 kg"
    // The stock item this food comes out of, and how much per meal in that item's unit. Feeding the
    // horse takes it out of stock; rations from before the link have only the text above.
    inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null },
    amount: { type: Number, min: 0 },
    unit: { type: String },
  },
  { _id: false }
);

const feedingScheduleSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    mealTime: { type: String, enum: ['morning', 'noon', 'evening'], required: true },
    // Clock time for the slot, "HH:mm". The three meal times used to be hard-coded in the client,
    // which meant the server generating feeding tasks had no idea when a meal was actually due.
    timeOfDay: { type: String, default: null },
    items: [feedingItemSchema],
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FeedingSchedule', feedingScheduleSchema);
