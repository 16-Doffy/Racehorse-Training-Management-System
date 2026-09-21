const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { login, register, me } = require('./auth.controller');

router.post('/login', login);
router.post('/register', register);
router.get('/me', protect, me);

module.exports = router;
