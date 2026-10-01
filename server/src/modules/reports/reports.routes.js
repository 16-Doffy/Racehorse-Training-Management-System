const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const { getOverview, getTrainingChart, getFinanceChart } = require('./reports.controller');

router.get('/overview', protect, authorize(ROLES.MANAGER), getOverview);
router.get('/training-chart', protect, getTrainingChart);
router.get('/finance-chart', protect, authorize(ROLES.MANAGER), getFinanceChart);

module.exports = router;
