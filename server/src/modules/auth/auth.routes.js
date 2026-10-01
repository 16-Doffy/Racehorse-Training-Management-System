const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { login, register, me, changePassword, updateProfile } = require('./auth.controller');

router.post('/login', login);
router.post('/register', register);
router.get('/me', protect, me);
router.put('/change-password', protect, changePassword);
router.put('/profile', protect, updateProfile);

module.exports = router;
