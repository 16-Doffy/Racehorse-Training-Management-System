const mongoose = require('mongoose');

// Scaffold model: full CRUD is exposed, detailed nutrition planning UI comes in a later phase.
const feedingItemSchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // grain, hay, vitamin, ...
    quantity: { type: String, required: true }, // e.g. "2kg"
  },
  { _id: false }
);

const feedingScheduleSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    mealTime: { type: String, enum: ['morning', 'noon', 'evening'], required: true },
    items: [feedingItemSchema],
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FeedingSchedule', feedingScheduleSchema);
