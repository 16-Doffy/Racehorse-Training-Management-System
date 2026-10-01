const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const { listHorses, getHorse, createHorse, updateHorse, deleteHorse, updateCareSchedule, archiveHorse, unarchiveHorse } = require('./horses.controller');
const { getTimeline } = require('./horseTimeline.controller');
const { getLineage } = require('./horseLineage.controller');

router.use(protect);

router.get('/', listHorses);
router.get('/:id/timeline', getTimeline);
router.get('/:id/lineage', getLineage);
router.get('/:id', getHorse);
router.post('/', authorize(ROLES.MANAGER), createHorse);
router.put('/:id', authorize(ROLES.MANAGER), updateHorse);
router.patch('/:id/care-schedule', authorize(ROLES.VETERINARIAN), updateCareSchedule);
router.delete('/:id', authorize(ROLES.MANAGER), deleteHorse);
router.patch('/:id/archive', authorize(ROLES.MANAGER), archiveHorse);
router.patch('/:id/unarchive', authorize(ROLES.MANAGER), unarchiveHorse);

module.exports = router;
