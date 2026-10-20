const PrescriptionTemplate = require('../../models/PrescriptionTemplate');
const { TEMPLATE_ROUTES, TEMPLATE_LEVELS } = require('../../models/PrescriptionTemplate');
const InventoryItem = require('../../models/InventoryItem');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_MEDICATIONS = 20;
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) || undefined : undefined);
const optionalNumber = (value) => (value === undefined || value === null || value === '' ? undefined : Number(value));
const isDayCount = (n) => Number.isInteger(n) && n >= 1 && n <= 90;

/** A template as sent by the prescription form, checked and tidied. Returns { value } or { error }. */
async function readTemplate(body = {}) {
  const name = text(body.name, 80);
  if (!name) return { error: 'Đặt tên cho toa mẫu.' };
  const days = optionalNumber(body.days);
  if (days !== undefined && !isDayCount(days)) return { error: 'Số ngày điều trị từ 1 đến 90.' };
  const trainingLevel = body.trainingLevel || 'high';
  if (!TEMPLATE_LEVELS.includes(trainingLevel)) return { error: 'Mức vận động không hợp lệ (none, light, moderate, high).' };
  const careInstructions = text(body.careInstructions, 600);
  const list = body.medications === undefined ? [] : body.medications;
  if (!Array.isArray(list)) return { error: 'medications phải là danh sách.' };
  if (list.length > MAX_MEDICATIONS) return { error: `Một toa mẫu tối đa ${MAX_MEDICATIONS} thuốc.` };
  if (!list.length && !careInstructions && trainingLevel === 'high') {
    return { error: 'Toa mẫu cần ít nhất một thuốc, một y lệnh chăm sóc hoặc một mức hạn chế tập.' };
  }

  // A medicine stays linked to the club's medicine list only while that item still exists.
  const ids = list.map((m) => m?.inventoryItem).filter(Boolean);
  const known = ids.length ? new Set((await InventoryItem.find({ _id: { $in: ids } }).select('_id')).map((i) => String(i._id))) : new Set();
  const medications = [];
  for (const [i, m] of list.entries()) {
    const label = `Thuốc thứ ${i + 1}`;
    const medName = text(m?.name, 120);
    if (!medName) return { error: `${label}: thiếu tên thuốc.` };
    const amount = optionalNumber(m.amount);
    if (amount !== undefined && !(Number.isFinite(amount) && amount > 0)) return { error: `${label}: lượng mỗi lần phải là số dương.` };
    const route = m.route || null;
    if (route && !TEMPLATE_ROUTES.includes(route)) return { error: `${label}: đường dùng không hợp lệ.` };
    const times = [...new Set((Array.isArray(m.times) ? m.times : []).map(String))].sort();
    const badTime = times.find((t) => !TIME_PATTERN.test(t));
    if (badTime) return { error: `${label}: giờ "${badTime}" không đúng dạng HH:mm.` };
    const medDays = optionalNumber(m.days);
    if (medDays !== undefined && !isDayCount(medDays)) return { error: `${label}: số ngày dùng từ 1 đến 90.` };
    medications.push({
      name: medName,
      inventoryItem: m.inventoryItem && known.has(String(m.inventoryItem)) ? m.inventoryItem : null,
      amount,
      unit: text(m.unit, 20),
      dosage: text(m.dosage, 80),
      route,
      times,
      days: medDays,
      instructions: text(m.instructions, 300),
    });
  }
  return {
    value: { name, condition: text(body.condition, 160), days, trainingLevel, lockReason: text(body.lockReason, 300), careInstructions, medications },
  };
}

/** GET /health/prescription-templates — every vet's templates, by name. */
const listTemplates = asyncHandler(async (req, res) => {
  const templates = await PrescriptionTemplate.find().populate('createdBy', 'name').sort({ name: 1 });
  return ok(res, templates, 'Prescription templates fetched.');
});

/**
 * POST /health/prescription-templates — saves a template under its name. The same vet saving the same
 * name again updates that template (adjust a prescription, save it over the old one).
 */
const saveTemplate = asyncHandler(async (req, res) => {
  const { value, error } = await readTemplate(req.body);
  if (error) return fail(res, error, 400);
  const existing = await PrescriptionTemplate.findOne({ createdBy: req.user._id, name: value.name });
  const template = existing ? Object.assign(existing, value) : new PrescriptionTemplate({ ...value, createdBy: req.user._id });
  await template.save();
  await logAction({
    actorId: req.user._id,
    action: existing ? 'prescriptionTemplate.update' : 'prescriptionTemplate.create',
    targetModel: 'PrescriptionTemplate',
    targetId: template._id,
    metadata: { name: template.name, medications: template.medications.length },
  });
  await template.populate('createdBy', 'name');
  return existing ? ok(res, template, 'Prescription template updated.') : created(res, template, 'Prescription template created.');
});

/** DELETE /health/prescription-templates/:id — only by the vet who made it. */
const deleteTemplate = asyncHandler(async (req, res) => {
  const template = await PrescriptionTemplate.findById(req.params.id);
  if (!template) return fail(res, 'Không tìm thấy toa mẫu.', 404);
  if (String(template.createdBy) !== String(req.user._id)) return fail(res, 'Chỉ bác sĩ tạo toa mẫu này mới xóa được.', 403);
  await template.deleteOne();
  await logAction({ actorId: req.user._id, action: 'prescriptionTemplate.delete', targetModel: 'PrescriptionTemplate', targetId: template._id, metadata: { name: template.name } });
  return ok(res, null, 'Prescription template deleted.');
});

module.exports = { listTemplates, saveTemplate, deleteTemplate, readTemplate };
