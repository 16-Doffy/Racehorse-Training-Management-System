const { fail } = require('../utils/apiResponse');

/** The first key starting with "$" anywhere in a request value, or null. */
function operatorKey(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 20) return null;
  for (const [key, inner] of Object.entries(value)) {
    if (key.startsWith('$')) return key;
    const nested = operatorKey(inner, depth + 1);
    if (nested) return nested;
  }
  return null;
}

/**
 * A request body or query string never carries MongoDB operators. Handlers pass the fields they
 * expect on to an update, but a body wrapped in "$set" slipped past checks that only look at the top
 * level (the vet's health conclusion, who may be a horse's trainer, which horse a ration belongs to),
 * and a query value like ?horse[$ne]=… would turn a lookup into a filter. Refused before any route.
 */
function rejectOperatorKeys(req, res, next) {
  const key = operatorKey(req.body) || operatorKey(req.query);
  if (key) return fail(res, `Dữ liệu gửi lên không hợp lệ (trường "${key}").`, 400);
  return next();
}

module.exports = rejectOperatorKeys;
