const mongoose = require('mongoose');
const { ALL_ROLES } = require('../constants/roles');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ALL_ROLES, required: true },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    // Separates "self-registered, waiting for a Club Manager to approve" from "existing staff
    // member who was deactivated" — both of which leave isActive false and would otherwise be
    // indistinguishable on the Manager's screen. Defaults to 'approved' so accounts created by a
    // Manager (and every account that already existed before this field) need no migration.
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
    },
    ownedHorses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Horse' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
