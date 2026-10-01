const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, fail } = require('../../utils/apiResponse');
const crudFactory = require('../../utils/crudFactory');
const InventoryItem = require('../../models/InventoryItem');
const { pushNotification } = require('../alerts/notification.service');
const DailyTask = require('../../models/DailyTask');
const { computeForecast, itemInUse } = require('./stock.service');

// Restock requests are reviewed by name on the Manager's screen, so the requester is populated
// here — otherwise the list hands back a raw ObjectId and the UI has nothing to show.
const CATEGORIES = ['feed', 'medicine', 'equipment'];

/** What the Manager types into the item form, checked before it reaches the stock count. */
function checkItem(req, ctx) {
  const message = itemProblem(req, ctx);
  return message ? { status: 400, message } : null;
}

function itemProblem(req, { existing }) {
  const b = req.body;
  if (!existing || b.name !== undefined) {
    if (typeof b.name !== 'string' || !b.name.trim()) return 'Tên vật tư không được để trống.';
  }
  if (!existing || b.unit !== undefined) {
    if (typeof b.unit !== 'string' || !b.unit.trim()) return 'Đơn vị tính không được để trống.';
  }
  if ((!existing || b.category !== undefined) && !CATEGORIES.includes(b.category)) return 'Danh mục không hợp lệ.';
  if (b.quantity !== undefined && (!Number.isFinite(Number(b.quantity)) || Number(b.quantity) < 0)) {
    return 'Số lượng tồn phải là số không âm.';
  }
  return null;
}

const ctrl = crudFactory(InventoryItem, {
  label: 'Inventory item',
  populate: [
    { path: 'restockRequests.requestedBy', select: 'name role' },
    { path: 'restockRequests.reviewedBy', select: 'name' },
    { path: 'proposedBy', select: 'name role' },
  ],
  // The request history and proposal flags are managed by the endpoints below, not the item form.
  fields: ['name', 'category', 'quantity', 'unit', 'stableBlock'],
  validate: checkItem,
});

/** Tells the Manager(s) there is a request to review — it used to wait until someone opened the page. */
async function tellManagers(message) {
  await pushNotification({ recipientRole: ROLES.MANAGER, type: 'restock_request', severity: 'info', message });
}

const requestRestock = asyncHandler(async (req, res) => {
  const quantity = Number(req.body.quantity);
  // Approving adds this number to stock, so a zero, negative or non-numeric request would quietly
  // shrink or corrupt the count the moment a Manager clicked approve.
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return fail(res, 'Số lượng đề xuất phải là số dương.', 400);
  }

  const item = await InventoryItem.findById(req.params.id);
  if (!item) return fail(res, 'Inventory item not found.', 404);

  const note = typeof req.body.note === 'string' ? req.body.note.trim() : undefined;
  // A request raised from a meal or dose that can't be recorded for lack of stock says so.
  let task = null;
  if (req.body.task) {
    task = await DailyTask.findById(req.body.task).populate('horse', 'name');
    if (!task) return fail(res, 'Không tìm thấy công việc.', 404);
  }
  item.restockRequests.push({ requestedBy: req.user._id, quantity, note, task: task?._id || null });
  await item.save();
  const blocking = task ? ` — đang chặn việc ${task.taskType === 'feeding' ? 'cho ăn' : 'cho thuốc'} của ${task.horse?.name || 'ngựa'}` : '';
  await pushNotification({
    recipientRole: ROLES.MANAGER,
    type: 'restock_request',
    severity: task ? 'warning' : 'info',
    message: `📦 ${req.user.name} đề xuất bổ sung ${quantity} ${item.unit} "${item.name}"${blocking}${note ? `: ${note}` : '.'}`,
  });
  return ok(res, item, 'Restock requested.');
});

/**
 * Asking for something the stock list doesn't have yet. Creates the item as a proposal (quantity
 * 0) carrying the request; the Manager approving it turns it into a regular item with that
 * quantity, rejecting it removes it. Same review endpoint as any restock request.
 */
const proposeItem = asyncHandler(async (req, res) => {
  const { name, category, unit, stableBlock } = req.body;
  const quantity = Number(req.body.quantity);
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : undefined;
  if (typeof name !== 'string' || !name.trim()) return fail(res, 'Hãy nhập tên vật tư cần đề xuất.', 400);
  if (typeof unit !== 'string' || !unit.trim()) return fail(res, 'Hãy nhập đơn vị tính.', 400);
  if (!CATEGORIES.includes(category)) return fail(res, 'Danh mục không hợp lệ.', 400);
  if (!Number.isFinite(quantity) || quantity <= 0) return fail(res, 'Số lượng đề xuất phải là số dương.', 400);

  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = await InventoryItem.findOne({ name: new RegExp(`^${escaped}$`, 'i') }).select('_id name isProposed');
  if (existing) {
    return fail(res, `"${existing.name}" đã có trong danh mục${existing.isProposed ? ' (đang chờ duyệt)' : ''} — hãy gửi đề xuất bổ sung cho mặt hàng đó.`, 409, { itemId: existing._id });
  }

  const item = await InventoryItem.create({
    name: name.trim(),
    category,
    unit: unit.trim(),
    stableBlock,
    quantity: 0,
    isProposed: true,
    proposedBy: req.user._id,
    restockRequests: [{ requestedBy: req.user._id, quantity, note }],
  });
  await tellManagers(`🆕 ${req.user.name} đề xuất vật tư mới: ${quantity} ${item.unit} "${item.name}"${note ? ` — ${note}` : '.'}`);
  return ok(res, item, 'New item proposed.');
});

// Closes the loop the requestRestock endpoint opens: a Manager can act on one pending request
// instead of it just sitting in the array forever. Approving actually adds the requested
// quantity to stock — the point of a restock request is to change the physical count, not just
// flip a status flag.
const reviewRestockRequest = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return fail(res, "status must be 'approved' or 'rejected'.", 400);
  }

  const item = await InventoryItem.findById(req.params.id);
  if (!item) return fail(res, 'Inventory item not found.', 404);

  const request = item.restockRequests.id(req.params.reqId);
  if (!request) return fail(res, 'Restock request not found.', 404);
  if (request.status !== 'pending') {
    return fail(res, `Request already ${request.status}.`, 409);
  }

  Object.assign(request, {
    status,
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
    reviewNote: typeof req.body.note === 'string' ? req.body.note.trim() : undefined,
  });
  if (status === 'approved') {
    item.quantity += request.quantity;
    item.isProposed = false; // a proposed item becomes part of the stock list
  }

  // A proposal turned down, with nothing else pending on it, is not an item the club stocks.
  const dropProposal = status === 'rejected' && item.isProposed && !item.restockRequests.some((r) => r.status === 'pending');
  if (dropProposal) await item.deleteOne();
  else await item.save();

  // Close the loop back to whoever asked: without this the requester has no way to know their
  // request was acted on except by reopening the supplies page and noticing the number changed.
  await pushNotification({
    recipientUser: request.requestedBy,
    type: 'restock_decision',
    severity: status === 'approved' ? 'info' : 'warning',
    message:
      status === 'approved'
        ? `✅ Yêu cầu bổ sung ${request.quantity} ${item.unit} "${item.name}" đã được duyệt. Tồn kho hiện tại: ${item.quantity} ${item.unit}.${
            request.task ? ' Bạn có thể hoàn thành công việc đang chờ (nếu còn trong khung giờ).' : ''
          }`
        : `❌ Yêu cầu ${dropProposal ? 'thêm vật tư mới' : 'bổ sung'} ${request.quantity} ${item.unit} "${item.name}" đã bị từ chối${
            request.reviewNote ? `: ${request.reviewNote}` : '.'
          }`,
  });

  return ok(res, dropProposal ? null : item, `Restock request ${status}.`);
});

router.use(protect);
router.get('/', ctrl.list);
// Daily use from rations and ongoing treatments, and how many days the stock lasts.
router.get('/forecast', asyncHandler(async (req, res) => ok(res, await computeForecast(), 'Inventory forecast computed.')));
router.get('/:id', ctrl.getOne);
router.post('/', authorize(ROLES.MANAGER), ctrl.createOne);
router.put('/:id', authorize(ROLES.MANAGER), ctrl.updateOne);
// An item a ration or an ongoing treatment draws on can't be deleted out from under it.
const refuseItemInUse = asyncHandler(async (req, res, next) => {
  const horses = await itemInUse(req.params.id);
  if (horses.length) {
    return fail(res, `Mặt hàng đang được dùng trong khẩu phần/đơn thuốc của: ${[...new Set(horses)].join(', ')} — hãy đổi món ở đó trước.`, 409);
  }
  return next();
});
router.delete('/:id', authorize(ROLES.MANAGER), refuseItemInUse, ctrl.removeOne);
router.post('/proposals', authorize(ROLES.GROOM, ROLES.HEAD_TRAINER, ROLES.VETERINARIAN), proposeItem);
router.post('/:id/restock-request', authorize(ROLES.GROOM, ROLES.HEAD_TRAINER, ROLES.VETERINARIAN), requestRestock);
router.patch('/:id/restock-requests/:reqId', authorize(ROLES.MANAGER), reviewRestockRequest);

module.exports = router;
