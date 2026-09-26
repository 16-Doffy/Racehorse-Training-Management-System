const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const Horse = require('../../models/Horse');
const StableAssignment = require('../../models/StableAssignment');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { ROLES, ALL_ROLES } = require('../../constants/roles');
const { toPublicUser } = require('../auth/auth.service');

const MIN_PASSWORD_LENGTH = 6;

const listUsers = asyncHandler(async (req, res) => {
  const { role, isActive, approvalStatus } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  // Lets the Manager screen pull just the self-registered accounts waiting for approval, which
  // isActive alone can't express (a deactivated staff member is also isActive=false).
  if (approvalStatus) filter.approvalStatus = approvalStatus;

  // The Head Trainer reads this list only to pick a groom to assign work to. They get exactly that
  // — active grooms — rather than the whole staff directory with every manager's contact details.
  if (req.user.role === ROLES.HEAD_TRAINER) {
    filter.role = ROLES.GROOM;
    filter.isActive = true;
  }

  const users = await User.find(filter).sort({ createdAt: -1 });
  return ok(res, users, 'Users fetched.');
});

const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return fail(res, 'User not found.', 404);
  if (req.user.role === ROLES.HEAD_TRAINER && user.role !== ROLES.GROOM) return fail(res, 'Forbidden.', 403);
  return ok(res, user, 'User fetched.');
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password || !role) {
    return fail(res, 'name, email, password and role are required.', 400);
  }
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return fail(res, `Mật khẩu tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`, 400);
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return fail(res, 'Email already in use.', 409);

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email: email.toLowerCase(), passwordHash, role, phone });

  await logAction({ actorId: req.user._id, action: 'user.create', targetModel: 'User', targetId: user._id, metadata: { role } });
  return created(res, toPublicUser(user), 'User created.');
});

/**
 * Horses that would be left with nobody in the slot this user fills. Returned when an account is
 * deactivated or moved to a different role, so the Manager is told which horses now need someone
 * — otherwise they silently disappear from every trainer's or vet's screen.
 */
async function horsesLeftUncovered(user) {
  const slot = {
    [ROLES.HEAD_TRAINER]: 'assignedTrainer',
    [ROLES.VETERINARIAN]: 'assignedVet',
    [ROLES.OWNER]: 'owner',
  }[user.role];
  const names = [];
  if (slot) {
    const horses = await Horse.find({ [slot]: user._id }).select('name');
    names.push(...horses.map((h) => h.name));
  }
  if (user.role === ROLES.GROOM) {
    const stalls = await StableAssignment.find({ assignedCaretaker: user._id }).populate('horse', 'name');
    names.push(...stalls.map((s) => s.horse?.name).filter(Boolean));
  }
  return names;
}

const coverageNote = (names) =>
  names.length ? ` Lưu ý: ${names.length} ngựa cần người thay thế — ${names.join(', ')}.` : '';

// Updates profile fields and/or role. Role changes are audited separately since they are
// security-sensitive (this is the RBAC assignment surface for the whole system).
const updateUser = asyncHandler(async (req, res) => {
  const { name, phone, role, isActive, password } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return fail(res, 'User not found.', 404);

  // A Manager demoting or disabling their own account can lock the club out of its only admin.
  const isSelf = String(user._id) === String(req.user._id);
  if (isSelf && ((role !== undefined && role !== user.role) || isActive === false)) {
    return fail(res, 'Không thể tự đổi vai trò hoặc tự khóa tài khoản của chính mình.', 409);
  }
  if (role !== undefined && !ALL_ROLES.includes(role)) return fail(res, 'Vai trò không hợp lệ.', 400);
  if (password && String(password).length < MIN_PASSWORD_LENGTH) {
    return fail(res, `Mật khẩu tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`, 400);
  }

  const previousRole = user.role;
  const previouslyActive = user.isActive;
  const losingCoverage = (isActive === false && previouslyActive) || (role !== undefined && role !== previousRole);
  const uncovered = losingCoverage ? await horsesLeftUncovered(user) : [];

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (role !== undefined) user.role = role;
  if (password) user.passwordHash = await bcrypt.hash(password, 10);
  if (isActive !== undefined) {
    user.isActive = isActive;
    // Switching a pending (or rejected) sign-up on from the edit form is an approval. Without
    // this, approvalStatus stayed "pending" and the account sat in the approval queue even though
    // it could already log in.
    if (isActive && user.approvalStatus !== 'approved') user.approvalStatus = 'approved';
  }
  await user.save();

  if (isActive === true && !previouslyActive) {
    await logAction({ actorId: req.user._id, action: 'user.approve', targetModel: 'User', targetId: user._id, metadata: { role: user.role } });
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

  return ok(res, { ...toPublicUser(user), uncoveredHorses: uncovered }, `Đã cập nhật tài khoản.${coverageNote(uncovered)}`);
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
  if (user.approvalStatus !== 'pending') return fail(res, 'Tài khoản này không ở trạng thái chờ duyệt.', 409);
  if (approve && role !== undefined && !ALL_ROLES.includes(role)) return fail(res, 'Vai trò không hợp lệ.', 400);

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

  return ok(res, toPublicUser(user), approve ? 'Đã duyệt tài khoản.' : 'Đã từ chối tài khoản.');
});

const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    return fail(res, 'Không thể tự khóa tài khoản của chính mình.', 409);
  }
  const user = await User.findById(req.params.id);
  if (!user) return fail(res, 'User not found.', 404);

  const uncovered = user.isActive ? await horsesLeftUncovered(user) : [];
  user.isActive = false;
  await user.save();
  await logAction({ actorId: req.user._id, action: 'user.deactivate', targetModel: 'User', targetId: user._id });

  return ok(res, { ...toPublicUser(user), uncoveredHorses: uncovered }, `Đã khóa tài khoản.${coverageNote(uncovered)}`);
});

module.exports = { listUsers, getUser, createUser, updateUser, decideRegistration, deleteUser };
