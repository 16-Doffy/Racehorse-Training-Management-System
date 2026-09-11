const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { signToken, toPublicUser } = require('./auth.service');
const { logAction } = require('../audit/audit.service');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return fail(res, 'Email and password are required.', 400);
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !user.isActive) {
    return fail(res, 'Invalid email or password.', 401);
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return fail(res, 'Invalid email or password.', 401);
  }

  const token = signToken(user);
  return ok(res, { token, user: toPublicUser(user) }, 'Login successful.');
});

// Public self-registration is limited to the Horse Owner role; every other role is provisioned
// by the Club Manager via the /users module so RBAC assignment stays under admin control.
const registerOwner = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return fail(res, 'name, email and password are required.', 400);
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return fail(res, 'Email already in use.', 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    phone,
    role: 'owner',
  });

  await logAction({ actorId: user._id, action: 'user.self_register', targetModel: 'User', targetId: user._id });

  const token = signToken(user);
  return created(res, { token, user: toPublicUser(user) }, 'Registration successful.');
});

const me = asyncHandler(async (req, res) => {
  return ok(res, req.user, 'Current user.');
});

module.exports = { login, registerOwner, me };
