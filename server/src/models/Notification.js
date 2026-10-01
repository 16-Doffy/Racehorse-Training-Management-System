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
        'exam_due', // periodic check-up the vet scheduled (careSchedule.nextExamDue)
        'incident_report',
        'exam_request',
        'restock_decision',
        // To the Manager: someone asked for supplies (or proposed a new item).
        'restock_request',
        'horse_assigned',
        'session_completed',
        'race_result', // to the owner: placing and prize money of their horse's race
        'readiness_override',
        'training_unlocked',
        // To the groom: work handed to them, a vet's care order, a session coming up for their horse.
        'task_assigned',
        'care_order',
        'session_scheduled',
        // A vet picked up or closed an incident — to the groom who reported it and the trainer.
        'incident_update',
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
