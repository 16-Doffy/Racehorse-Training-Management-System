const router = require('express').Router();
const mongoose = require('mongoose');
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, fail } = require('../../utils/apiResponse');
const AuditLog = require('../../models/AuditLog');
const User = require('../../models/User');

// Only the Club Manager can review the system audit trail.
router.use(protect, authorize(ROLES.MANAGER));

const isId = (value) => mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === String(value);

/**
 * The Mongo filter for the list's query, or { error }. `action` is one action ("trainingSession.start")
 * or, ending with a dot, a whole family ("trainingSession."). `from`/`to` bound createdAt.
 */
function auditFilter(query) {
  const filter = {};
  if (query.actor) {
    if (!isId(query.actor)) return { error: 'Người thực hiện không hợp lệ.' };
    filter.actor = query.actor;
  }
  if (query.action) {
    const action = String(query.action).trim();
    if (!/^[A-Za-z_.]+$/.test(action)) return { error: 'Hành động không hợp lệ.' };
    filter.action = action.endsWith('.') ? { $regex: `^${action.replace(/\./g, '\\.')}` } : action;
  }
  if (query.targetModel) {
    if (!/^[A-Za-z]+$/.test(String(query.targetModel))) return { error: 'Loại đối tượng không hợp lệ.' };
    filter.targetModel = query.targetModel;
  }
  if (query.targetId) {
    if (!isId(query.targetId)) return { error: 'Mã đối tượng không hợp lệ.' };
    filter.targetId = query.targetId;
  }
  if (query.from || query.to) {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) return { error: 'Khoảng ngày không hợp lệ.' };
    if (from && to && from > to) return { error: 'Ngày bắt đầu phải trước ngày kết thúc.' };
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  return { filter };
}

/** GET /audit-logs?page&limit&actor&action&targetModel&targetId&from&to — newest first. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const { filter, error } = auditFilter(req.query);
    if (error) return fail(res, error, 400);

    const [items, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actor', 'name email role')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    return ok(res, { items, total, page, limit });
  })
);

/**
 * What the filters can pick from: the actions and kinds of record that appear in the trail, and
 * the people who did something (including accounts locked since).
 * GET /audit-logs/facets
 */
router.get(
  '/facets',
  asyncHandler(async (req, res) => {
    const [actions, targetModels, actorIds] = await Promise.all([
      AuditLog.distinct('action'),
      AuditLog.distinct('targetModel'),
      AuditLog.distinct('actor'),
    ]);
    const actors = await User.find({ _id: { $in: actorIds } }).select('name email role isActive').sort({ name: 1 });
    return ok(res, { actions: actions.sort(), targetModels: targetModels.filter(Boolean).sort(), actors });
  })
);

module.exports = router;
