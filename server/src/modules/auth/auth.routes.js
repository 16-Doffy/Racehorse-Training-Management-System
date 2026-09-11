const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { login, registerOwner, me } = require('./auth.controller');

router.post('/login', login);
router.post('/register', registerOwner);
router.get('/me', protect, me);

module.exports = router;
