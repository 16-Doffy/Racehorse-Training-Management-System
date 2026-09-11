const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');

const listUsers = asyncHandler(async (req, res) => {
  const { role } = req.query;
  const filter = role ? { role } : {};
  const users = await User.find(filter).sort({ createdAt: -1 });
  return ok(res, users, 'Users fetched.');
});

const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return fail(res, 'User not found.', 404);
  return ok(res, user, 'User fetched.');
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password || !role) {
    return fail(res, 'name, email, password and role are required.', 400);
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return fail(res, 'Email already in use.', 409);

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email: email.toLowerCase(), passwordHash, role, phone });

  await logAction({
    actorId: req.user._id,
    action: 'user.create',
    targetModel: 'User',
    targetId: user._id,
    metadata: { role },
  });

  return created(res, user, 'User created.');
});

// Updates profile fields and/or role. Role changes are audited separately since they are
// security-sensitive (this is the RBAC assignment surface for the whole system).
const updateUser = asyncHandler(async (req, res) => {
  const { name, phone, role, isActive, password } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return fail(res, 'User not found.', 404);

  const previousRole = user.role;

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (isActive !== undefined) user.isActive = isActive;
  if (role !== undefined) user.role = role;
  if (password) user.passwordHash = await bcrypt.hash(password, 10);

  await user.save();

  if (role !== undefined && role !== previousRole) {
    await logAction({
      actorId: req.user._id,
      action: 'user.role_change',
      targetModel: 'User',
      targetId: user._id,
      metadata: { from: previousRole, to: role },
    });
  }

  return ok(res, user, 'User updated.');
});

const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!user) return fail(res, 'User not found.', 404);

  await logAction({ actorId: req.user._id, action: 'user.deactivate', targetModel: 'User', targetId: user._id });

  return ok(res, user, 'User deactivated.');
});

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser };
