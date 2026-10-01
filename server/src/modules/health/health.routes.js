const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const { uploadMedicalFiles } = require('../../middlewares/uploadMiddleware');
const recordCtrl = require('./healthRecord.controller');
const treatmentCtrl = require('./treatment.controller');
const markerCtrl = require('./injuryMarker.controller');

router.use(protect);

// Health records: viewable by everyone, written only by the Veterinarian.
router.get('/records', recordCtrl.listRecords);
router.get('/records/:id', recordCtrl.getRecord);
router.post('/records', authorize(ROLES.VETERINARIAN), recordCtrl.createRecord);
router.put('/records/:id', authorize(ROLES.VETERINARIAN), recordCtrl.updateRecord);
router.post('/records/:id/attachments', authorize(ROLES.VETERINARIAN), uploadMedicalFiles.array('files', 5), recordCtrl.addAttachments);
router.delete('/records/:id/attachments/:attachmentId', authorize(ROLES.VETERINARIAN), recordCtrl.removeAttachment);

// Head Trainer/Manager can flag a horse for a check-up; only the Vet can act on it by creating
// an actual HealthRecord above.
router.post('/exam-requests', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), recordCtrl.requestExam);
// Vet: their queue. Head Trainer: the requests they sent, with status. Manager: all.
router.get('/exam-requests', authorize(ROLES.VETERINARIAN, ROLES.HEAD_TRAINER, ROLES.MANAGER), recordCtrl.listExamRequests);
router.patch('/exam-requests/:id', authorize(ROLES.VETERINARIAN), recordCtrl.resolveExamRequest);
router.get('/clearances', recordCtrl.listClearances);

// Treatments, including the emergency training-lock order.
// The vet's care orders and today's progress on them (trainer, manager, vet, owner, groom).
router.get('/care-orders', treatmentCtrl.listCareOrders);
router.get('/treatments', treatmentCtrl.listTreatments);
router.get('/treatments/:id', treatmentCtrl.getTreatment);
router.post('/treatments', authorize(ROLES.VETERINARIAN), treatmentCtrl.createTreatment);
router.put('/treatments/:id', authorize(ROLES.VETERINARIAN), treatmentCtrl.updateTreatment);
router.post('/treatments/:id/lock-training', authorize(ROLES.VETERINARIAN), treatmentCtrl.setTrainingLock);

// Injury markers (2D placeholder for the future 3D musculoskeletal viewer).
router.get('/injury-markers', markerCtrl.listMarkers);
router.post('/injury-markers', authorize(ROLES.VETERINARIAN), markerCtrl.createMarker);
router.put('/injury-markers/:id', authorize(ROLES.VETERINARIAN), markerCtrl.updateMarker);
router.delete('/injury-markers/:id', authorize(ROLES.VETERINARIAN), markerCtrl.deleteMarker);

module.exports = router;
