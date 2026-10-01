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
