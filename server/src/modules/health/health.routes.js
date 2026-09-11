const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const recordCtrl = require('./healthRecord.controller');
const treatmentCtrl = require('./treatment.controller');
const markerCtrl = require('./injuryMarker.controller');

router.use(protect);

// Health records: viewable by everyone, written only by the Veterinarian.
router.get('/records', recordCtrl.listRecords);
router.get('/records/:id', recordCtrl.getRecord);
router.post('/records', authorize(ROLES.VETERINARIAN), recordCtrl.createRecord);
router.put('/records/:id', authorize(ROLES.VETERINARIAN), recordCtrl.updateRecord);

// Treatments, including the emergency training-lock order.
router.get('/treatments', treatmentCtrl.listTreatments);
router.get('/treatments/:id', treatmentCtrl.getTreatment);
router.post('/treatments', authorize(ROLES.VETERINARIAN), treatmentCtrl.createTreatment);
router.put('/treatments/:id', authorize(ROLES.VETERINARIAN), treatmentCtrl.updateTreatment);
router.post('/treatments/:id/lock-training', authorize(ROLES.VETERINARIAN), treatmentCtrl.setTrainingLock);

// Injury markers (2D placeholder for the future 3D musculoskeletal viewer).
router.get('/injury-markers', markerCtrl.listMarkers);
router.post('/injury-markers', authorize(ROLES.VETERINARIAN), markerCtrl.createMarker);
router.put('/injury-markers/:id', authorize(ROLES.VETERINARIAN), markerCtrl.updateMarker);

module.exports = router;
