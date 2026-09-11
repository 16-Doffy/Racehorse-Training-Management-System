const { fail } = require('../utils/apiResponse');

/** Restricts a route to one or more roles. Must run after `protect` so req.user is set. */
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return fail(res, 'Not authenticated.', 401);
  }
  if (!allowedRoles.includes(req.user.role)) {
    return fail(res, `Forbidden: role '${req.user.role}' cannot access this resource.`, 403);
  }
  next();
};

module.exports = { authorize };
