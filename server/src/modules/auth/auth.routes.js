const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const loginLimit = require('../../middlewares/loginLimit');
const { login, register, me, changePassword, updateProfile } = require('./auth.controller');

router.post('/login', loginLimit, login);
router.post('/register', register);
router.get('/me', protect, me);
router.put('/change-password', protect, changePassword);
router.put('/profile', protect, updateProfile);

module.exports = router;
