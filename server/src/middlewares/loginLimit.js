const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { fail } = require('../utils/apiResponse');

/**
 * Guessing passwords: wrong attempts only, per address and account. A login that succeeds is not counted,
 * so the workflows that sign in many times a shift never come near it, and one account's wrong guesses
 * do not lock anyone else out of the same address.
 */
module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email || '').toLowerCase()}`,
  handler: (req, res) => fail(res, 'Nhập sai quá nhiều lần. Thử lại sau 15 phút.', 429),
});
