const mongoose = require('mongoose');

/**
 * A care job handed to the stable for a stretch of days rather than for one day: ice the forelegs at
 * 07:30 and 16:30, 20 minutes each, every day from 1/11 to 30/11. Each day it is due, it becomes one
 * task per time on the groom's list (modules/stable/careRoutine.service.js), so nobody has to hand the
 * same job out again tomorrow. It ends on its last day, or when the trainer stops it.
 */
const careRoutineSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    // The groom who does it; empty: whoever looks after the horse's stall that day.
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    taskType: { type: String, enum: ['cleaning', 'bathing', 'icing', 'hoof_care', 'other'], required: true },
    // What a job of type "other" is ("Dắt đi bộ thư giãn"); the other types are named by their type.
    title: { type: String, trim: true, maxlength: 80 },
    // How to do it, step by step: what the groom reads on each task.
    instructions: { type: String, trim: true, maxlength: 2000, required: true },
    // Each time of day it is done ("07:30"): how many times a day is how many times are listed.
    times: { type: [{ type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ }], required: true },
    // How long each time takes.
    durationMinutes: { type: Number, min: 1, max: 480, required: true },
    // The days of the week it is done (JS getDay: 0 Sunday … 6 Saturday).
    weekDays: { type: [{ type: Number, min: 0, max: 6 }], default: [0, 1, 2, 3, 4, 5, 6] },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null }, // none: until stopped
    status: { type: String, enum: ['active', 'stopped'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stoppedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    stoppedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

careRoutineSchema.index({ horse: 1, status: 1 });

module.exports = mongoose.model('CareRoutine', careRoutineSchema);
