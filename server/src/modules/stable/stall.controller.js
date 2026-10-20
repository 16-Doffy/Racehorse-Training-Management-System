const mongoose = require('mongoose');
const Stall = require('../../models/Stall');
const StableAssignment = require('../../models/StableAssignment');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { runTransaction, operationError } = require('../../utils/transaction');
const { logAction } = require('../audit/audit.service');
const { getScopedHorseIds, isHorseInScope, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const { ROLES } = require('../../constants/roles');

const { STALL_TYPES, STALL_STATUSES, ZONE_KEY } = Stall;
const MAX_ZONE_STALLS = 40;
const zoneLabel = (zone) => `Khu ${zone}`;
const stallCode = (zone, number) => `${zone}-${String(number).padStart(2, '0')}`;

const horseCard = (horse) => horse && {
  _id: horse._id, name: horse.name, breed: horse.breed, color: horse.color, healthStatus: horse.healthStatus,
};

/**
 * Who stands in each stall, as this user may see it. Everyone sees which stalls are taken (it is the
 * same stable); the horse's name, coat and caretaker only for horses the user may see — an owner sees
 * their own horses, not the neighbours'.
 */
async function occupants(user, stallIds) {
  const [assignments, scoped] = await Promise.all([
    StableAssignment.find({ stall: { $in: stallIds } })
      .populate('horse', 'name breed color healthStatus isArchived')
      .populate('assignedCaretaker', 'name'),
    getScopedHorseIds(user),
  ]);
  const byStall = new Map();
  for (const a of assignments) {
    if (!a.horse || a.horse.isArchived) continue;
    const visible = isHorseInScope(scoped, a.horse._id);
    byStall.set(String(a.stall), visible
      ? { assignment: a._id, horse: horseCard(a.horse), caretaker: a.assignedCaretaker ? { _id: a.assignedCaretaker._id, name: a.assignedCaretaker.name } : null, since: a.updatedAt }
      : { hidden: true });
  }
  return { byStall, scoped };
}

const stallJson = (stall, occupant) => ({
  _id: stall._id,
  code: stall.code,
  zone: stall.zone,
  zoneName: stall.zoneName || zoneLabel(stall.zone),
  zonePurpose: stall.zonePurpose || '',
  type: stall.type,
  order: stall.order,
  status: stall.status,
  maintenanceNote: stall.maintenanceNote || '',
  maintenanceUntil: stall.maintenanceUntil,
  isActive: stall.isActive,
  occupied: Boolean(occupant),
  occupant: occupant || null,
});

/**
 * GET /stable/stalls — the stable map: every stall in use, in zone order, with who stands in it.
 * `unplaced` lists the horses (that this user may see) whose stall is still free text from before the
 * map existed, so the Manager can place them. `?all=true` (Manager) includes stalls taken out of use.
 */
const listStalls = asyncHandler(async (req, res) => {
  const filter = req.query.all === 'true' && req.user.role === ROLES.MANAGER ? {} : { isActive: true };
  const stalls = await Stall.find(filter).sort({ zone: 1, order: 1, code: 1 });
  const { byStall, scoped } = await occupants(req.user, stalls.map((s) => s._id));
  const legacy = await StableAssignment.find({ $or: [{ stall: null }, { stall: { $exists: false } }] })
    .populate('horse', 'name breed color healthStatus isArchived')
    .populate('assignedCaretaker', 'name');
  const unplaced = legacy
    .filter((a) => a.horse && !a.horse.isArchived && isHorseInScope(scoped, a.horse._id))
    .map((a) => ({ assignment: a._id, horse: horseCard(a.horse), stableBlock: a.stableBlock, caretaker: a.assignedCaretaker ? { _id: a.assignedCaretaker._id, name: a.assignedCaretaker.name } : null }));
  return ok(res, { stalls: stalls.map((s) => stallJson(s, byStall.get(String(s._id)))), unplaced }, 'Stalls fetched.');
});

/** GET /stable/stalls/by-horse/:horseId — the horse's stall and caretaker, for its detail page (any role that may see the horse). */
const stallForHorse = asyncHandler(async (req, res) => {
  if (!(await canAccessHorse(req.user, req.params.horseId))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  const assignment = await StableAssignment.findOne({ horse: req.params.horseId }).populate('stall').populate('assignedCaretaker', 'name');
  if (!assignment) return ok(res, null, 'This horse has no stall yet.');
  return ok(res, {
    assignment: assignment._id,
    stableBlock: assignment.stableBlock,
    stall: assignment.stall ? stallJson(assignment.stall) : null,
    caretaker: assignment.assignedCaretaker ? { _id: assignment.assignedCaretaker._id, name: assignment.assignedCaretaker.name } : null,
    since: assignment.updatedAt,
  }, 'Stall fetched.');
});

/** The editable fields, checked. Returns { values } or { error }. */
function readFields(body, { creating }) {
  const values = {};
  if (creating) {
    const zone = String(body.zone || '').trim().toUpperCase();
    if (!ZONE_KEY.test(zone)) return { error: 'Mã khu chỉ gồm 1–4 chữ in hoa hoặc số, ví dụ A, B, CL.' };
    values.zone = zone;
    const code = body.code ? String(body.code).trim().toUpperCase() : body.number ? stallCode(zone, Number(body.number)) : '';
    if (!/^[A-Z0-9]{1,4}-[A-Z0-9]{1,6}$/.test(code)) return { error: 'Mã chuồng có dạng <khu>-<số>, ví dụ A-03. Nhập mã hoặc số chuồng.' };
    if (!code.startsWith(`${zone}-`)) return { error: `Mã chuồng phải bắt đầu bằng mã khu "${zone}-".` };
    values.code = code;
  }
  if (body.zoneName !== undefined) values.zoneName = String(body.zoneName || '').trim().slice(0, 60);
  if (body.zonePurpose !== undefined) values.zonePurpose = String(body.zonePurpose || '').trim().slice(0, 120);
  if (body.type !== undefined) {
    if (!STALL_TYPES.includes(body.type)) return { error: 'Loại chuồng: standard (thường), isolation (cách ly) hoặc recovery (hồi phục).' };
    values.type = body.type;
  }
  if (body.order !== undefined) {
    if (!Number.isInteger(Number(body.order))) return { error: 'Thứ tự chuồng phải là số nguyên.' };
    values.order = Number(body.order);
  }
  if (body.status !== undefined) {
    if (!STALL_STATUSES.includes(body.status)) return { error: 'Trạng thái chuồng: active (đang dùng) hoặc maintenance (bảo trì).' };
    values.status = body.status;
  }
  if (body.maintenanceNote !== undefined) values.maintenanceNote = String(body.maintenanceNote || '').trim().slice(0, 200);
  if (body.maintenanceUntil !== undefined) {
    const until = body.maintenanceUntil ? new Date(body.maintenanceUntil) : null;
    if (until && Number.isNaN(until.getTime())) return { error: 'Ngày xong bảo trì không hợp lệ.' };
    values.maintenanceUntil = until;
  }
  return { values };
}

/** POST /stable/stalls (Manager) — one stall: { zone, code | number, zoneName?, zonePurpose?, type?, order? }. */
const createStall = asyncHandler(async (req, res) => {
  const { values, error } = readFields(req.body || {}, { creating: true });
  if (error) return fail(res, error, 400);
  if (await Stall.exists({ code: values.code })) return fail(res, `Đã có chuồng ${values.code}.`, 409);
  if (values.order === undefined) values.order = await Stall.countDocuments({ zone: values.zone });
  const stall = await Stall.create(values);
  await logAction({ actorId: req.user._id, action: 'stall.create', targetModel: 'Stall', targetId: stall._id, metadata: { code: stall.code } });
  return created(res, stallJson(stall), 'Stall created.');
});

/**
 * POST /stable/stalls/generate (Manager) — a zone's stalls in one go: { zone, count, zoneName?,
 * zonePurpose?, type? } makes <zone>-01 … <zone>-<count>, leaving out codes that already exist.
 */
const generateZone = asyncHandler(async (req, res) => {
  const { values, error } = readFields({ ...req.body, number: 1 }, { creating: true });
  if (error) return fail(res, error, 400);
  const count = Number(req.body?.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_ZONE_STALLS) return fail(res, `Số chuồng phải từ 1 đến ${MAX_ZONE_STALLS}.`, 400);
  const { zone } = values;
  const codes = Array.from({ length: count }, (_, i) => stallCode(zone, i + 1));
  const existing = new Set((await Stall.find({ code: { $in: codes } }).select('code')).map((s) => s.code));
  const shared = { zone, zoneName: values.zoneName, zonePurpose: values.zonePurpose, type: values.type };
  const docs = codes.map((code, i) => ({ ...shared, code, order: i })).filter((d) => !existing.has(d.code));
  const made = docs.length ? await Stall.insertMany(docs) : [];
  await logAction({ actorId: req.user._id, action: 'stall.generate', targetModel: 'Stall', metadata: { zone, created: made.length, skipped: existing.size } });
  return created(res, { created: made.map((s) => stallJson(s)), skipped: [...existing] }, `${made.length} stalls created.`);
});

/** PATCH /stable/stalls/:id (Manager) — zone name/purpose, type, order, maintenance. The code never changes (it is on the nameplate). */
const updateStall = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 'Không tìm thấy chuồng.', 404);
  const { values, error } = readFields(req.body || {}, { creating: false });
  if (error) return fail(res, error, 400);
  if (values.status === 'active') { values.maintenanceNote = ''; values.maintenanceUntil = null; }
  // The occupancy check and the change in one transaction, after writing the stall (Stall.claim), so
  // a horse placed at the same moment either lands first (and this is refused) or meets the maintenance.
  const stall = await runTransaction(async (session) => {
    const current = await Stall.claim({ _id: req.params.id }, session);
    if (!current) throw operationError(404, 'Không tìm thấy chuồng.');
    if (values.status === 'maintenance' && current.status !== 'maintenance') {
      const occupant = await StableAssignment.findOne({ stall: current._id }).populate('horse', 'name').session(session);
      if (occupant) throw operationError(409, `Chuồng ${current.code} đang có ngựa ${occupant.horse?.name || ''} — chuyển ngựa sang chuồng khác trước khi bảo trì.`);
    }
    Object.assign(current, values);
    await current.save({ session });
    current.$session(null);
    return current;
  });
  await logAction({ actorId: req.user._id, action: 'stall.update', targetModel: 'Stall', targetId: stall._id, metadata: { code: stall.code, ...values } });
  const { byStall } = await occupants(req.user, [stall._id]);
  return ok(res, stallJson(stall, byStall.get(String(stall._id))), 'Stall updated.');
});

/** DELETE /stable/stalls/:id (Manager) — takes an empty stall out of use (kept, so its code stays reserved). */
const retireStall = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 'Không tìm thấy chuồng.', 404);
  // As for maintenance: the stall is written first, so a placement at the same moment cannot slip in.
  const stall = await runTransaction(async (session) => {
    const current = await Stall.claim({ _id: req.params.id }, session);
    if (!current) throw operationError(404, 'Không tìm thấy chuồng.');
    const occupant = await StableAssignment.findOne({ stall: current._id }).populate('horse', 'name').session(session);
    if (occupant) throw operationError(409, `Chuồng ${current.code} đang có ngựa ${occupant.horse?.name || ''} — chuyển ngựa trước khi bỏ chuồng.`);
    current.isActive = false;
    await current.save({ session });
    current.$session(null);
    return current;
  });
  await logAction({ actorId: req.user._id, action: 'stall.retire', targetModel: 'Stall', targetId: stall._id, metadata: { code: stall.code } });
  return ok(res, stallJson(stall), 'Stall taken out of use.');
});

module.exports = { listStalls, stallForHorse, createStall, generateZone, updateStall, retireStall };
