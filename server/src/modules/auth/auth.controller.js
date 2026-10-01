const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { signToken, toPublicUser } = require('./auth.service');
const { logAction } = require('../audit/audit.service');
const { ALL_ROLES } = require('../../constants/roles');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return fail(res, 'Email and password are required.', 400);
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) {
    return fail(res, 'Email hoặc mật khẩu không đúng.', 401);
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return fail(res, 'Email hoặc mật khẩu không đúng.', 401);
  }

  // Checked only after the password matches, so this never reveals whether an email exists to
  // someone guessing — but a real pending user gets told why they can't get in yet, instead of
  // the misleading "wrong password" they used to see.
  if (!user.isActive) {
    return fail(
      res,
      'Tài khoản của bạn đang chờ Club Manager duyệt (hoặc đã bị vô hiệu hoá). Vui lòng liên hệ quản lý câu lạc bộ.',
      403
    );
  }

  const token = signToken(user);
  return ok(res, { token, user: toPublicUser(user) }, 'Login successful.');
});

// Public self-registration for any role. The requested role is NOT granted on trust: the account
// is created inactive and stays unusable until a Club Manager approves it from the staff
// management screen, so nobody can hand themselves Manager rights just by picking it in a
// dropdown. No token is returned for the same reason — there is nothing to log into yet.
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role } = req.body;
  if (!name || !email || !password || !role) {
    return fail(res, 'name, email, password và role là bắt buộc.', 400);
  }

  if (String(password).length < 6) {
    return fail(res, 'Mật khẩu tối thiểu 6 ký tự.', 400);
  }

  if (!ALL_ROLES.includes(role)) {
    return fail(res, `role không hợp lệ. Giá trị cho phép: ${ALL_ROLES.join(', ')}.`, 400);
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return fail(res, 'Email này đã được đăng ký.', 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    phone,
    role,
    isActive: false,
    approvalStatus: 'pending',
  });

  await logAction({ actorId: user._id, action: 'user.self_register', targetModel: 'User', targetId: user._id, metadata: { role } });

  return created(
    res,
    { user: toPublicUser(user) },
    'Đăng ký thành công. Tài khoản đang chờ Club Manager duyệt trước khi đăng nhập được.'
  );
});

const me = asyncHandler(async (req, res) => {
  return ok(res, req.user, 'Current user.');
});

/**
 * The signed-in user changes their own password. The current one is required, so a session left
 * open on a shared stable computer can't be used to lock the real owner out.
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return fail(res, 'Nhập mật khẩu hiện tại và mật khẩu mới.', 400);
  if (String(newPassword).length < 6) return fail(res, 'Mật khẩu mới tối thiểu 6 ký tự.', 400);
  if (currentPassword === newPassword) return fail(res, 'Mật khẩu mới phải khác mật khẩu hiện tại.', 400);

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return fail(res, 'Mật khẩu hiện tại không đúng.', 400);
  }
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  await logAction({ actorId: user._id, action: 'user.change_password', targetModel: 'User', targetId: user._id });
  return ok(res, null, 'Đã đổi mật khẩu.');
});

/**
 * The signed-in user edits their own name, phone and avatar. Email and role stay with the Club
 * Manager — they decide who someone is in the system and what they may do.
 */
const updateProfile = asyncHandler(async (req, res) => {
  const changes = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return fail(res, 'Tên không được để trống.', 400);
    changes.name = name;
  }
  if (req.body.phone !== undefined) changes.phone = String(req.body.phone).trim();
  if (req.body.avatarUrl !== undefined) {
    const url = String(req.body.avatarUrl || '').trim();
    if (url && !/^(https?:\/\/|\/api\/v1\/files\/)/.test(url)) return fail(res, 'Ảnh đại diện phải là link tải lên từ hệ thống.', 400);
    changes.avatarUrl = url || undefined;
  }

  const user = await User.findByIdAndUpdate(req.user._id, changes, { new: true, runValidators: true });
  await logAction({ actorId: user._id, action: 'user.update_profile', targetModel: 'User', targetId: user._id, metadata: Object.keys(changes) });
  return ok(res, toPublicUser(user), 'Đã cập nhật hồ sơ.');
});

module.exports = { login, register, me, changePassword, updateProfile };
