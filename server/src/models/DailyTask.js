const mongoose = require('mongoose');

const incidentReportSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    images: [{ type: String }], // relative URLs served from /uploads
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    reportedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const dailyTaskSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    taskType: {
      type: String,
      enum: ['feeding', 'cleaning', 'bathing', 'icing'],
      required: true,
    },
    scheduledDate: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: ['pending', 'completed', 'skipped'], default: 'pending' },
    completedAt: { type: Date },
    incidentReport: incidentReportSchema,
  },
  { timestamps: true }
);

module.exports = mongoose.model('DailyTask', dailyTaskSchema);
