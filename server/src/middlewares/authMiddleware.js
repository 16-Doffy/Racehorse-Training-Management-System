const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const User = require('../models/User');
const { fail } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

/** Verifies the Bearer JWT and attaches the authenticated user (minus password) to req.user. */
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return fail(res, 'Not authenticated. Missing token.', 401);
  }

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch (err) {
    return fail(res, 'Invalid or expired token.', 401);
  }

  const user = await User.findById(payload.id).select('-passwordHash');
  if (!user || !user.isActive) {
    return fail(res, 'User not found or deactivated.', 401);
  }

  req.user = user;
  next();
});

module.exports = { protect };
