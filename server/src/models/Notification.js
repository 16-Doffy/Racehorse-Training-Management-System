const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // A notification targets either a specific user or every user of a role (e.g. all head trainers).
    recipientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    recipientRole: { type: String, default: null },
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse' },
    type: {
      type: String,
      enum: [
        'fitness_alert',
        'injury_lock',
        'vaccination_due',
        'deworming_due',
        'farrier_due',
        'incident_report',
        'exam_request',
        'restock_decision',
        'horse_assigned',
        'system',
      ],
      required: true,
    },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
