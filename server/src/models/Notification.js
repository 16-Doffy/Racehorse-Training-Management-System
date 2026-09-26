const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // A notification targets either a specific user or every user of a role (e.g. all head trainers).
    recipientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    recipientRole: { type: String, default: null },
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse' },
    // Set when the notification is about one specific session, so a fitness alert can be traced
    // back to the workout that produced it instead of only to the horse.
    trainingSession: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingSession', default: null },
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
        'session_completed',
        'readiness_override',
        'training_unlocked',
        'system',
      ],
      required: true,
    },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    message: { type: String, required: true },
    // Read state for a notification addressed to one user.
    isRead: { type: Boolean, default: false },
    // Read state for a notification addressed to a whole role. A single isRead flag was shared by
    // everyone in the role, so the first trainer to open the bell cleared it for all the others.
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
