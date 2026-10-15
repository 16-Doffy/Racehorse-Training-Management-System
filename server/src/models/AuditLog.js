const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true }, // e.g. "user.create", "treatment.lock_training"
    targetModel: { type: String },
    targetId: { type: mongoose.Schema.Types.ObjectId },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The Manager's audit page reads newest first, often narrowed to one person or one record.
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ targetId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
