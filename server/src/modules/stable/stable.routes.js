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
// Per horse: rations and prescriptions with their stock, and what is short (the groom's sheet).
router.get('/my-care-plan', taskCtrl.myCarePlan);
router.get('/tasks/:id', taskCtrl.getTask);
router.post('/tasks', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), taskCtrl.createTask);
router.put('/tasks/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), taskCtrl.updateTask);
router.delete('/tasks/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), taskCtrl.deleteTask);
router.patch('/tasks/:id/complete', authorize(ROLES.GROOM), taskCtrl.completeTask);
router.patch('/tasks/:id/acknowledge', authorize(ROLES.GROOM), taskCtrl.acknowledgeTask);
router.patch('/tasks/:id/not-done', authorize(ROLES.GROOM), taskCtrl.reportNotDone);
router.post(
  '/tasks/:id/incident',
  authorize(ROLES.GROOM),
  uploadIncidentImages.array('images', 5),
  taskCtrl.reportIncident
);

// Incident reports as a list with a lifecycle: the groom files one, the vet picks it up and closes it.
router.get('/incidents', taskCtrl.listIncidents);
router.patch('/incidents/:id', authorize(ROLES.VETERINARIAN), taskCtrl.handleIncident);

// Stable/stall assignment map.
router.get('/assignments', assignmentCtrl.listAssignments);
router.post('/assignments', authorize(ROLES.MANAGER, ROLES.HEAD_TRAINER), assignmentCtrl.upsertAssignment);
router.delete('/assignments/:id', authorize(ROLES.MANAGER), assignmentCtrl.deleteAssignment);

module.exports = router;
