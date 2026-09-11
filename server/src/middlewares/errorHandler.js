const { fail } = require('../utils/apiResponse');

/** Central error handler: normalizes Mongoose/validation errors into the standard API response shape. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[error]', err);

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((e) => e.message).join('; ');
    return fail(res, message, 400);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return fail(res, `Duplicate value for '${field}'.`, 409);
  }

  if (err.name === 'CastError') {
    return fail(res, `Invalid value for '${err.path}'.`, 400);
  }

  const status = err.statusCode || 500;
  return fail(res, err.message || 'Internal server error.', status);
}

function notFound(req, res) {
  return fail(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

module.exports = { errorHandler, notFound };
