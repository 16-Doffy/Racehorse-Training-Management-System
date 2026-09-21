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

module.exports = { login, register, me };
