const mongoose = require('mongoose');

// Stores where on the horse's body an injury was marked. UI renders this as a 2D placeholder
// diagram for now; the {x,y} coordinates are normalized (0-1) against a reference silhouette image.
const injuryMarkerSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    healthRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthRecord' },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bodyPart: { type: String, required: true },
    coordinates: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    severity: { type: String, enum: ['mild', 'moderate', 'severe'], required: true },
    recoveryStatus: {
      type: String,
      enum: ['new', 'in_treatment', 'recovering', 'recovered'],
      default: 'new',
    },
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('InjuryMarker', injuryMarkerSchema);
