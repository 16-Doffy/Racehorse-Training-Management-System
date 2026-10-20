const mongoose = require('mongoose');

const vector = { x: { type: Number, required: true }, y: { type: Number, required: true }, z: { type: Number, required: true } };

// Where the vet marked the injury on the 3D horse (client/public/models/horse.glb, in its own units).
// layer 'surface': a point on the skin, with the way the skin faces there (normal), so the mark sits on
// that side of the body. layer 'internal': an organ or deep structure picked inside the body (no normal).
const location3dSchema = new mongoose.Schema(
  {
    position: vector,
    normal: { x: Number, y: Number, z: Number },
    layer: { type: String, enum: ['surface', 'internal'], default: 'surface' },
  },
  { _id: false }
);

// Stores where on the horse's body an injury was marked. {x,y} is the place along the body (0 = nose,
// 0.97 = tail) and its height (0 = ears, 0.95 = hooves), as on the side picture the vet used before the
// 3D map; the groom's app places the mark from it. Marks made on the 3D map also keep `location3d`.
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
    location3d: { type: location3dSchema, default: undefined },
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
