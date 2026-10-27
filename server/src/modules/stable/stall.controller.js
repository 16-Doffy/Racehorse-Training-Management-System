const mongoose = require('mongoose');
const Stall = require('../../models/Stall');
const StableAssignment = require('../../models/StableAssignment');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { runTransaction, operationError } = require('../../utils/transaction');
const { logAction } = require('../audit/audit.service');
const { getScopedHorseIds, isHorseInScope, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const { ROLES } = require('../../constants/roles');
const { CARETAKER_FIELDS, caretakerProblem } = require('./caretaker');
const { setStallCaretaker } = require('./stallCaretaker.service');
const { placementProblem } = require('./placement');

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

// Who looks after the whole stable (the Manager and the grooms) see every stall's groom; the other roles
// only the groom of a horse they may see.
const SEES_STALL_GROOMS = new Set([ROLES.MANAGER, ROLES.GROOM]);

/**
 * The stall's groom as { _id, name, inactive? }. A stall given a groom before they lost their account
 * (locked, or moved to another role) says so; a stall from before stalls had grooms shows the groom of
 * the horse standing in it.
 */
function stallCaretaker(stall, occupant, user) {
  if (user && !SEES_STALL_GROOMS.has(user.role)) return occupant && !occupant.hidden ? occupant.caretaker || null : null;
  const own = stall.caretaker;
  if (own && own.name !== undefined) return { _id: own._id, name: own.name, ...(caretakerProblem(own) ? { inactive: true } : {}) };
  if (own) return { _id: own };
  return occupant && !occupant.hidden ? occupant.caretaker || null : null;
}

const stallJson = (stall, occupant, user) => ({
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
  caretaker: stallCaretaker(stall, occupant, user),
});

/**
 * GET /stable/stalls — the stable map: every stall in use, in zone order, with who stands in it.
 * `unplaced` lists the horses (that this user may see) whose stall is still free text from before the
 * map existed, so the Manager can place them. `?all=true` (Manager) includes stalls taken out of use.
 */
const listStalls = asyncHandler(async (req, res) => {
  const filter = req.query.all === 'true' && req.user.role === ROLES.MANAGER ? {} : { isActive: true };
  const stalls = await Stall.find(filter).sort({ zone: 1, order: 1, code: 1 }).populate('caretaker', CARETAKER_FIELDS);
  const { byStall, scoped } = await occupants(req.user, stalls.map((s) => s._id));
  const legacy = await StableAssignment.find({ $or: [{ stall: null }, { stall: { $exists: false } }] })
    .populate('horse', 'name breed color healthStatus isArchived')
    .populate('assignedCaretaker', 'name');
  const unplaced = legacy
    .filter((a) => a.horse && !a.horse.isArchived && isHorseInScope(scoped, a.horse._id))
    .map((a) => ({ assignment: a._id, horse: horseCard(a.horse), stableBlock: a.stableBlock, caretaker: a.assignedCaretaker ? { _id: a.assignedCaretaker._id, name: a.assignedCaretaker.name } : null }));
  // A horse in the wrong part of the stable for its health (placement.js): said on its stall.
  const recoveryStalls = stalls.some((s) => s.isActive && s.type === 'recovery');
  const withPlacement = (s) => {
    const occupant = byStall.get(String(s._id));
    return { ...stallJson(s, occupant, req.user), placement: occupant?.horse ? placementProblem(occupant.horse, s, { recoveryStalls }) : null };
  };
  return ok(res, { stalls: stalls.map(withPlacement), unplaced }, 'Stalls fetched.');
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
  const found = await Stall.find({ code: { $in: codes } }).select('code isActive');
  const existing = new Set(found.filter((s) => s.isActive).map((s) => s.code));
  // Stalls taken out of use keep their codes; laying the zone out again brings them back, as new.
  const retired = found.filter((s) => !s.isActive).map((s) => s.code);
  const shared = { zone, zoneName: values.zoneName, zonePurpose: values.zonePurpose, type: values.type };
  const docs = codes.map((code, i) => ({ ...shared, code, order: i })).filter((d) => !existing.has(d.code) && !retired.includes(d.code));
  const made = docs.length ? await Stall.insertMany(docs) : [];
  if (retired.length) {
    const reset = Object.fromEntries(Object.entries(shared).filter(([, value]) => value !== undefined));
    await Stall.updateMany(
      { code: { $in: retired } },
      { $set: { ...reset, isActive: true, status: 'active', maintenanceNote: '', maintenanceUntil: null, caretaker: null } }
    );
  }
  const back = retired.length ? await Stall.find({ code: { $in: retired } }) : [];
  await logAction({ actorId: req.user._id, action: 'stall.generate', targetModel: 'Stall', metadata: { zone, created: made.length, reopened: back.length, skipped: existing.size } });
  return created(res, { created: [...made, ...back].map((s) => stallJson(s)), skipped: [...existing] }, `${made.length + back.length} stalls created.`);
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

/** { caretaker: <groom id> | null } from the body, checked. Returns { caretaker } or { error }. */
function readCaretaker(body = {}) {
  if (!Object.prototype.hasOwnProperty.call(body, 'caretaker')) return { error: 'Gửi caretaker: id nhân viên chăm sóc, hoặc null để bỏ người phụ trách.' };
  const caretaker = body.caretaker || null;
  if (caretaker && !mongoose.isValidObjectId(caretaker)) return { error: 'Nhân viên chăm sóc không hợp lệ.' };
  return { caretaker };
}

/** The given stalls as the map shows them to this user, with their grooms and occupants. */
async function stallsAsMap(user, stallIds) {
  const stalls = await Stall.find({ _id: { $in: stallIds } }).sort({ zone: 1, order: 1, code: 1 }).populate('caretaker', CARETAKER_FIELDS);
  const { byStall } = await occupants(user, stallIds);
  return stalls.map((s) => stallJson(s, byStall.get(String(s._id)), user));
}

/**
 * PUT /stable/stalls/:id/caretaker (Manager) — { caretaker: <groom id> | null }. The stall's groom; the
 * horse standing in it goes to them too, with its unfinished feeds and care orders.
 */
const setCaretakerOfStall = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 'Không tìm thấy chuồng.', 404);
  const { caretaker, error } = readCaretaker(req.body);
  if (error) return fail(res, error, 400);
  const { stalls, moved } = await setStallCaretaker({ stallId: req.params.id, caretaker });
  await logAction({
    actorId: req.user._id,
    action: 'stall.caretaker',
    targetModel: 'Stall',
    targetId: stalls[0]._id,
    metadata: { code: stalls[0].code, caretaker, horsesMoved: moved.length },
  });
  const [stall] = await stallsAsMap(req.user, stalls.map((s) => s._id));
  return ok(res, stall, caretaker ? 'Stall caretaker set.' : 'Stall caretaker removed.');
});

/** The zone key from the URL ("a" → "A"), or null when it is not one. */
const zoneParam = (value) => {
  const zone = String(value || '').trim().toUpperCase();
  return ZONE_KEY.test(zone) ? zone : null;
};

const stallNumber = (code) => Number(String(code).split('-')[1]) || 0;
const idsOf = (value) => (Array.isArray(value) ? value : []).map(String);

/**
 * PUT /stable/zones/:zone (Manager) — the zone dialog in one go:
 *   { zoneName?, zonePurpose?, remove?: [stall ids], add?: n, type? }
 * In one transaction: the name and purpose on every stall of the zone; the listed stalls out of use,
 * only while they are empty (409 names the horses); and n stalls added after the zone's highest number,
 * of `type`, without a groom yet (a code taken out of use before comes
 * back as new). The key itself (A) is part of the stall codes on the nameplates, so it never changes.
 * Returns { zone, removed: [codes], added: [codes], stalls }.
 */
const editZone = asyncHandler(async (req, res) => {
  const zone = zoneParam(req.params.zone);
  if (!zone) return fail(res, 'Mã khu không hợp lệ.', 400);
  const body = req.body || {};
  const names = {};
  if (body.zoneName !== undefined) {
    names.zoneName = String(body.zoneName || '').trim().slice(0, 60);
    if (!names.zoneName) return fail(res, 'Tên khu không được để trống.', 400);
  }
  if (body.zonePurpose !== undefined) names.zonePurpose = String(body.zonePurpose || '').trim().slice(0, 120);
  const remove = idsOf(body.remove);
  if (remove.some((id) => !mongoose.isValidObjectId(id))) return fail(res, 'Chuồng cần bỏ không hợp lệ.', 400);
  const add = body.add === undefined || body.add === null || body.add === '' ? 0 : Number(body.add);
  if (!Number.isInteger(add) || add < 0 || add > MAX_ZONE_STALLS) return fail(res, `Số chuồng thêm từ 0 đến ${MAX_ZONE_STALLS}.`, 400);
  if (body.type !== undefined && body.type !== null && !STALL_TYPES.includes(body.type)) {
    return fail(res, 'Loại chuồng: standard (thường), isolation (cách ly) hoặc recovery (hồi phục).', 400);
  }
  if (!Object.keys(names).length && !remove.length && !add) return fail(res, 'Không có gì để sửa.', 400);

  const result = await runTransaction(async (session) => {
    const inZone = await Stall.find({ zone, isActive: true }).session(session);
    if (!inZone.length) throw operationError(404, `Không có chuồng nào trong khu ${zone}.`);
    const removing = inZone.filter((s) => remove.includes(String(s._id)));
    if (removing.length !== new Set(remove).size) throw operationError(400, 'Có chuồng cần bỏ không thuộc khu này (hoặc đã bỏ rồi).');
    const keep = inZone.filter((s) => !remove.includes(String(s._id)));
    if (!keep.length && !add) throw operationError(400, 'Không bỏ hết chuồng của khu — muốn bỏ cả khu thì dùng Xoá khu.');
    if (keep.length + add > MAX_ZONE_STALLS) throw operationError(400, `Một khu tối đa ${MAX_ZONE_STALLS} chuồng.`);

    // The stalls to take out: written first (Stall.claim), so a horse placed at the same moment either
    // lands first (and this is refused) or meets the stall gone.
    for (const stall of removing) {
      // eslint-disable-next-line no-await-in-loop
      await Stall.claim({ _id: stall._id }, session);
    }
    if (removing.length) {
      const horses = await StableAssignment.find({ stall: { $in: removing.map((s) => s._id) } }).populate('horse', 'name').session(session);
      if (horses.length) {
        const list = horses.map((a) => `${a.horse?.name || 'ngựa'} (${a.stableBlock})`).join(', ');
        throw operationError(409, `Còn ${horses.length} ngựa: ${list} — chuyển ngựa sang chuồng khác trước khi bỏ chuồng.`);
      }
      await Stall.updateMany({ _id: { $in: removing.map((s) => s._id) } }, { $set: { isActive: false } }, { session });
    }
    if (Object.keys(names).length) await Stall.updateMany({ zone, isActive: true }, { $set: names }, { session });

    const added = [];
    if (add) {
      const sample = keep[0] || inZone[0];
      // A new stall has no groom yet: the Manager gives each stall its groom.
      const shared = {
        zone,
        zoneName: names.zoneName ?? sample.zoneName,
        zonePurpose: names.zonePurpose ?? sample.zonePurpose,
        type: body.type || sample.type || 'standard',
        caretaker: null,
      };
      // After the highest number in the zone, the stalls being taken out included, so a stall taken
      // out now is not the one added back.
      let number = Math.max(0, ...inZone.map((s) => stallNumber(s.code)));
      while (added.length < add) {
        number += 1;
        const code = stallCode(zone, number);
        // eslint-disable-next-line no-await-in-loop
        const old = await Stall.findOne({ code }).session(session);
        if (old?.isActive) continue;
        const fresh = { ...shared, order: number - 1, status: 'active', maintenanceNote: '', maintenanceUntil: null, isActive: true };
        if (old) {
          Object.assign(old, fresh);
          // eslint-disable-next-line no-await-in-loop
          await old.save({ session });
        } else {
          // eslint-disable-next-line no-await-in-loop
          await Stall.create([{ ...fresh, code }], { session });
        }
        added.push(code);
      }
    }
    return { removed: removing.map((s) => s.code).sort(), added };
  });

  await logAction({ actorId: req.user._id, action: 'stall.zoneEdit', targetModel: 'Stall', metadata: { zone, ...names, ...result } });
  const ids = (await Stall.find({ zone, isActive: true }).select('_id')).map((s) => s._id);
  return ok(res, { zone, ...result, stalls: await stallsAsMap(req.user, ids) }, 'Zone updated.');
});

/**
 * DELETE /stable/zones/:zone (Manager) — takes every stall of the zone out of use, only while none of
 * them has a horse (409 names them). The codes stay reserved: laying the zone out again brings the
 * stalls back. Written stall by stall first (Stall.claim), so a horse placed at the same moment either
 * lands first (and this is refused) or meets the zone gone.
 */
const retireZone = asyncHandler(async (req, res) => {
  const zone = zoneParam(req.params.zone);
  if (!zone) return fail(res, 'Mã khu không hợp lệ.', 400);
  const codes = await runTransaction(async (session) => {
    const ids = (await Stall.find({ zone, isActive: true }).select('_id').session(session)).map((s) => s._id);
    if (!ids.length) throw operationError(404, `Không có chuồng nào trong khu ${zone}.`);
    const claimed = [];
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      claimed.push(await Stall.claim({ _id: id }, session));
    }
    const horses = await StableAssignment.find({ stall: { $in: ids } }).populate('horse', 'name').session(session);
    if (horses.length) {
      const list = horses.map((a) => `${a.horse?.name || 'ngựa'} (${a.stableBlock})`).join(', ');
      throw operationError(409, `Khu ${zone} còn ${horses.length} ngựa: ${list} — chuyển ngựa sang chuồng khác trước khi xoá khu.`);
    }
    await Stall.updateMany({ _id: { $in: ids } }, { $set: { isActive: false } }, { session });
    return claimed.map((s) => s.code).sort();
  });
  await logAction({ actorId: req.user._id, action: 'stall.zoneRetire', targetModel: 'Stall', metadata: { zone, stalls: codes } });
  return ok(res, { zone, retired: codes }, 'Zone taken out of use.');
});

module.exports = {
  listStalls,
  stallForHorse,
  createStall,
  generateZone,
  updateStall,
  retireStall,
  setCaretakerOfStall,
  editZone,
  retireZone,
};
