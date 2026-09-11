const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const { listUsers, getUser, createUser, updateUser, deleteUser } = require('./users.controller');

// Full user/RBAC management is the Club Manager's core flow.
router.use(protect, authorize(ROLES.MANAGER));

router.get('/', listUsers);
router.get('/:id', getUser);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;
