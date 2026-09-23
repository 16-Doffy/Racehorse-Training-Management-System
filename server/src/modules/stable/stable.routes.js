const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { uploadIncidentImages } = require('../../middlewares/uploadMiddleware');
const { ROLES } = require('../../constants/roles');
const taskCtrl = require('./dailyTask.controller');
const assignmentCtrl = require('./stableAssignment.controller');

router.use(protect);

// Daily tasks: Head Trainer/Manager assign, Groom executes and reports.
router.get('/tasks', taskCtrl.listTasks);
router.get('/tasks/:id', taskCtrl.getTask);
router.post('/tasks', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), taskCtrl.createTask);
router.put('/tasks/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), taskCtrl.updateTask);
router.delete('/tasks/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), taskCtrl.deleteTask);
router.patch('/tasks/:id/complete', authorize(ROLES.GROOM), taskCtrl.completeTask);
router.post(
  '/tasks/:id/incident',
  authorize(ROLES.GROOM),
  uploadIncidentImages.array('images', 5),
  taskCtrl.reportIncident
);

// Stable/stall assignment map.
router.get('/assignments', assignmentCtrl.listAssignments);
router.post('/assignments', authorize(ROLES.MANAGER, ROLES.HEAD_TRAINER), assignmentCtrl.upsertAssignment);
router.delete('/assignments/:id', authorize(ROLES.MANAGER), assignmentCtrl.deleteAssignment);

module.exports = router;
