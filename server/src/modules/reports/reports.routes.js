const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const { getOverview } = require('./reports.controller');

router.get('/overview', protect, authorize(ROLES.MANAGER), getOverview);

module.exports = router;
