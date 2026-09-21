const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');

const listUsers = asyncHandler(async (req, res) => {
  const { role, isActive, approvalStatus } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  // Lets the Manager screen pull just the self-registered accounts waiting for approval, which
  // isActive alone can't express (a deactivated staff member is also isActive=false).
  if (approvalStatus) filter.approvalStatus = approvalStatus;
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
  const previouslyActive = user.isActive;

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (isActive !== undefined) user.isActive = isActive;
  if (role !== undefined) user.role = role;
  if (password) user.passwordHash = await bcrypt.hash(password, 10);

  await user.save();

  // Activating a previously inactive account is how a self-registration gets approved, so it is
  // worth its own audit entry rather than being invisible inside a generic profile update.
  if (isActive === true && !previouslyActive) {
    await logAction({
      actorId: req.user._id,
      action: 'user.approve',
      targetModel: 'User',
      targetId: user._id,
      metadata: { role: user.role },
    });
  }

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

// Club Manager's decision on a self-registered account. Approving is what actually lets the
// person log in (register leaves isActive false on purpose); rejecting keeps the record so the
// same email can't silently re-register into a clean slate, and so the audit trail shows the
// decision was made.
const decideRegistration = asyncHandler(async (req, res) => {
  const { approve, role } = req.body;
  if (approve === undefined) return fail(res, 'approve (true/false) là bắt buộc.', 400);

  const user = await User.findById(req.params.id);
  if (!user) return fail(res, 'User not found.', 404);

  if (user.approvalStatus !== 'pending') {
    return fail(res, 'Tài khoản này không ở trạng thái chờ duyệt.', 409);
  }

  // The Manager can correct the role the applicant picked for themselves before approving —
  // self-selected roles are a request, not an entitlement.
  if (approve && role !== undefined) user.role = role;
  user.approvalStatus = approve ? 'approved' : 'rejected';
  user.isActive = !!approve;
  await user.save();

  await logAction({
    actorId: req.user._id,
    action: approve ? 'user.registration_approved' : 'user.registration_rejected',
    targetModel: 'User',
    targetId: user._id,
    metadata: { role: user.role },
  });

  return ok(res, user, approve ? 'Đã duyệt tài khoản.' : 'Đã từ chối tài khoản.');
});

const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!user) return fail(res, 'User not found.', 404);

  await logAction({ actorId: req.user._id, action: 'user.deactivate', targetModel: 'User', targetId: user._id });

  return ok(res, user, 'User deactivated.');
});

module.exports = { listUsers, getUser, createUser, updateUser, decideRegistration, deleteUser };
