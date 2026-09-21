const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const { listUsers, getUser, createUser, updateUser, decideRegistration, deleteUser } = require('./users.controller');

router.use(protect);

// Read access is broader than write on purpose: creating/editing accounts and assigning roles
// (RBAC) is the Club Manager's exclusive job, but Head Trainer legitimately needs to look up the
// Groom staff directory to assign daily tasks to them (see stable/dailyTask.controller.js) —
// without this, GET /users?role=groom 403s for Head Trainer and their assignment dropdown has
// nothing to show.
router.get('/', authorize(ROLES.MANAGER, ROLES.HEAD_TRAINER), listUsers);
router.get('/:id', authorize(ROLES.MANAGER, ROLES.HEAD_TRAINER), getUser);
router.post('/', authorize(ROLES.MANAGER), createUser);
router.put('/:id', authorize(ROLES.MANAGER), updateUser);
// Approve/reject a self-registration (POST /auth/register leaves the account inactive).
router.patch('/:id/approval', authorize(ROLES.MANAGER), decideRegistration);
router.delete('/:id', authorize(ROLES.MANAGER), deleteUser);

module.exports = router;
