const mongoose = require('mongoose');

const healthRecordSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    examinedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, default: Date.now },
    diagnosis: { type: String, required: true },
    vitalSigns: {
      temperatureC: { type: Number },
      heartRate: { type: Number },
      respiratoryRate: { type: Number },
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
    notes: { type: String },
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
