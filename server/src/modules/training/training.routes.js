const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const planCtrl = require('./trainingPlan.controller');
const sessionCtrl = require('./trainingSession.controller');

router.use(protect);

// Training plans: authored by the Head Trainer, viewable by everyone (owner, vet, groom need visibility).
router.get('/plans', planCtrl.listPlans);
router.get('/plans/:id', planCtrl.getPlan);
router.post('/plans', authorize(ROLES.HEAD_TRAINER), planCtrl.createPlan);
router.put('/plans/:id', authorize(ROLES.HEAD_TRAINER), planCtrl.updatePlan);
router.delete('/plans/:id', authorize(ROLES.HEAD_TRAINER), planCtrl.deletePlan);

// Training sessions.
router.get('/sessions', sessionCtrl.listSessions);
// Must be declared before '/sessions/:id', otherwise "readiness" is swallowed as an id.
// Open to every authenticated role: the vet, groom and owner screens show the same board.
router.get('/sessions/readiness', sessionCtrl.getReadiness);
router.get('/sessions/:id', sessionCtrl.getSession);
router.post('/sessions', authorize(ROLES.HEAD_TRAINER), sessionCtrl.createSession);
router.put('/sessions/:id', authorize(ROLES.HEAD_TRAINER), sessionCtrl.updateSession);
// Start now: rechecks readiness against the current moment. Optional { overrideReason }.
router.post('/sessions/:id/start', authorize(ROLES.HEAD_TRAINER), sessionCtrl.startSession);
router.patch('/sessions/:id/evaluation', authorize(ROLES.HEAD_TRAINER), sessionCtrl.recordEvaluation);
router.delete('/sessions/:id', authorize(ROLES.HEAD_TRAINER), sessionCtrl.deleteSession);

module.exports = router;
