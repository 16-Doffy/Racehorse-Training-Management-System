const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { ok } = require('../../utils/apiResponse');
const clubPolicy = require('../../config/clubPolicy');

// The club's training and care rules, so every screen words them the same way (config/clubPolicy.js).
router.get('/policy', protect, (req, res) => ok(res, clubPolicy, 'Club policy fetched.'));

module.exports = router;
