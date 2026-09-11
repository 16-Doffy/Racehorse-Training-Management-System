const HealthRecord = require('../../models/HealthRecord');
const Horse = require('../../models/Horse');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');

const listRecords = asyncHandler(async (req, res) => {
  const { horse } = req.query;
  const filter = horse ? { horse } : {};
  const records = await HealthRecord.find(filter)
    .populate('horse', 'name healthStatus')
    .populate('examinedBy', 'name')
    .sort({ date: -1 });
  return ok(res, records, 'Health records fetched.');
});

const getRecord = asyncHandler(async (req, res) => {
  const record = await HealthRecord.findById(req.params.id).populate('horse').populate('examinedBy', 'name');
  if (!record) return fail(res, 'Health record not found.', 404);
  return ok(res, record, 'Health record fetched.');
});

// Examining a horse also updates its overall healthStatus, which is what drives the stable-wide
// status board (eligible / monitoring / injured / quarantined).
const createRecord = asyncHandler(async (req, res) => {
  const record = await HealthRecord.create({ ...req.body, examinedBy: req.user._id });

  await Horse.findByIdAndUpdate(record.horse, { healthStatus: record.resultStatus });
  await logAction({ actorId: req.user._id, action: 'healthRecord.create', targetModel: 'HealthRecord', targetId: record._id });

  return created(res, record, 'Health record created.');
});

const updateRecord = asyncHandler(async (req, res) => {
  const record = await HealthRecord.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!record) return fail(res, 'Health record not found.', 404);

  if (req.body.resultStatus) {
    await Horse.findByIdAndUpdate(record.horse, { healthStatus: req.body.resultStatus });
  }

  return ok(res, record, 'Health record updated.');
});

module.exports = { listRecords, getRecord, createRecord, updateRecord };
