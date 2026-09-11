const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn } = require('../../config/env');

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function toPublicUser(user) {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.passwordHash;
  return obj;
}

module.exports = { signToken, toPublicUser };
