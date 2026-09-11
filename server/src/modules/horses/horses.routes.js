const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const { listHorses, getHorse, createHorse, updateHorse, deleteHorse } = require('./horses.controller');

router.use(protect);

router.get('/', listHorses);
router.get('/:id', getHorse);
router.post('/', authorize(ROLES.MANAGER), createHorse);
router.put('/:id', authorize(ROLES.MANAGER), updateHorse);
router.delete('/:id', authorize(ROLES.MANAGER), deleteHorse);

module.exports = router;
