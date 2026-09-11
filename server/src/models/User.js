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
    ownedHorses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Horse' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
