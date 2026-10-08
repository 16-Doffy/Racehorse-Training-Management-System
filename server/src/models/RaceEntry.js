const mongoose = require('mongoose');

// Same surfaces as a training plan, so a plan aimed at a race can take the race's surface.
const SURFACES = ['turf', 'dirt', 'synthetic', 'sand'];

const raceEntrySchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    raceName: { type: String, required: true },
    raceDate: { type: Date, required: true },
    distance: { type: Number },
    venue: { type: String, trim: true }, // the racecourse, e.g. "Trường đua Đại Nam"
    surface: { type: String, enum: SURFACES },
    status: {
      type: String,
      enum: ['registered', 'confirmed', 'completed', 'withdrawn'],
      default: 'registered',
    },
    result: { type: String },
    position: { type: Number, min: 1 }, // finishing place
    finishTime: { type: String, trim: true }, // e.g. "1:12.45"
    prizeMoney: { type: Number, min: 0, default: 0 },
    // The revenue entry the prize money became, so editing the result updates it instead of adding another.
    financeRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialRecord', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RaceEntry', raceEntrySchema);
module.exports.SURFACES = SURFACES;
