const mongoose = require('mongoose');

const healthRecordSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    examinedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, default: Date.now },
    diagnosis: { type: String, required: true },
    // What the vet was told and saw before examining: the complaint and how it came about.
    history: { type: String, trim: true },
    vitalSigns: {
      temperatureC: { type: Number },
      heartRate: { type: Number },
      respiratoryRate: { type: Number },
      weightKg: { type: Number, min: 0 },
    },
    // What the vet found by hand and eye beside the numbers, each optional: gum colour, capillary
    // refill, gut sounds, hydration, and lameness on the AAEP scale (0 sound … 5 non-weight-bearing).
    clinical: {
      mucousMembrane: { type: String, enum: ['pink', 'pale', 'congested', 'icteric', 'cyanotic', null] },
      capillaryRefillSec: { type: Number, min: 0, max: 10 },
      gutSounds: { type: String, enum: ['normal', 'reduced', 'increased', 'absent', null] },
      hydration: { type: String, enum: ['normal', 'mild', 'moderate', 'severe', null] },
      lamenessGrade: { type: Number, min: 0, max: 5 },
      lamenessLimb: { type: String, enum: ['fore_left', 'fore_right', 'hind_left', 'hind_right', null] },
    },
    resultStatus: {
      type: String,
      enum: ['eligible', 'monitoring', 'injured', 'quarantined'],
      required: true,
    },
    // The vet's assessment of how hard the horse may work from now on (after an injury or a treatment):
    // none, light, moderate, high. Empty for an exam that says nothing about training. The newest one
    // caps the training level until a later assessment raises it.
    clearedLevel: { type: String, enum: ['none', 'light', 'moderate', 'high', null], default: null },
    // What the horse eats from this exam while it is not fit (feeding/dietOrder.js): a sick diet fitted to
    // the illness, or 'plan' under monitoring, with the vet's own words for the groom. None when it is fit.
    dietPlan: {
      type: new mongoose.Schema(
        {
          kind: { type: String, enum: ['plan', 'rest', 'colic', 'laminitis', 'respiratory', 'ulcer'], required: true },
          note: { type: String, trim: true, maxlength: 300 },
        },
        { _id: false }
      ),
      default: null,
    },
    notes: { type: String },
    // The follow-up the vet booked on this exam: it becomes the horse's next exam due (careSchedule.nextExamDue),
    // which the care scheduler reminds the vet of.
    followUpAt: { type: Date, default: null },
    // X-rays, lab results, scanned prescriptions (stored in GridFS, see utils/fileStore.js).
    attachments: [
      {
        url: { type: String, required: true },
        name: { type: String },
        contentType: { type: String },
        size: { type: Number },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('HealthRecord', healthRecordSchema);
