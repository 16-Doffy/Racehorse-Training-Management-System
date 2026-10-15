const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const { listHorses, listChecklists, getChecklist, listOwnerSummary, getOwnerOverview, getHorse, createHorse, updateHorse, deleteHorse, updateCareSchedule, archiveHorse, unarchiveHorse } = require('./horses.controller');
const { listCareEvents, createCareEvent, deleteCareEvent } = require('./careEvent.controller');
const { getTimeline } = require('./horseTimeline.controller');
const { getLineage } = require('./horseLineage.controller');

router.use(protect);

router.get('/', listHorses);
// Before '/:id', or "checklist" would be read as an id.
router.get('/checklist', listChecklists);
router.get('/owner-summary', authorize(ROLES.OWNER), listOwnerSummary);
router.get('/owner-overview', authorize(ROLES.OWNER), getOwnerOverview);
router.get('/:id/checklist', getChecklist);
router.get('/:id/timeline', getTimeline);
router.get('/:id/lineage', getLineage);
router.get('/:id', getHorse);
router.post('/', authorize(ROLES.MANAGER), createHorse);
router.put('/:id', authorize(ROLES.MANAGER), updateHorse);
router.patch('/:id/care-schedule', authorize(ROLES.VETERINARIAN), updateCareSchedule);
// Routine care history: vaccinations, deworming, farrier visits (careEvent.controller.js).
router.get('/:id/care-events', listCareEvents);
router.post('/:id/care-events', authorize(ROLES.VETERINARIAN), createCareEvent);
router.delete('/:id/care-events/:eventId', authorize(ROLES.VETERINARIAN), deleteCareEvent);
router.delete('/:id', authorize(ROLES.MANAGER), deleteHorse);
router.patch('/:id/archive', authorize(ROLES.MANAGER), archiveHorse);
router.patch('/:id/unarchive', authorize(ROLES.MANAGER), unarchiveHorse);

module.exports = router;
