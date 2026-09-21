const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, fail } = require('../../utils/apiResponse');
const crudFactory = require('../../utils/crudFactory');
const InventoryItem = require('../../models/InventoryItem');

// Restock requests are reviewed by name on the Manager's screen, so the requester is populated
// here — otherwise the list hands back a raw ObjectId and the UI has nothing to show.
const ctrl = crudFactory(InventoryItem, {
  label: 'Inventory item',
  populate: [{ path: 'restockRequests.requestedBy', select: 'name role' }],
});

const requestRestock = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const item = await InventoryItem.findById(req.params.id);
  if (!item) return fail(res, 'Inventory item not found.', 404);

  item.restockRequests.push({ requestedBy: req.user._id, quantity });
  await item.save();
  return ok(res, item, 'Restock requested.');
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

  request.status = status;
  if (status === 'approved') {
    item.quantity += request.quantity;
  }
  await item.save();

  return ok(res, item, `Restock request ${status}.`);
});

router.use(protect);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorize(ROLES.MANAGER), ctrl.createOne);
router.put('/:id', authorize(ROLES.MANAGER), ctrl.updateOne);
router.delete('/:id', authorize(ROLES.MANAGER), ctrl.removeOne);
router.post('/:id/restock-request', authorize(ROLES.GROOM, ROLES.HEAD_TRAINER, ROLES.VETERINARIAN), requestRestock);
router.patch('/:id/restock-requests/:reqId', authorize(ROLES.MANAGER), reviewRestockRequest);

module.exports = router;
