const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, fail } = require('../../utils/apiResponse');
const crudFactory = require('../../utils/crudFactory');
const InventoryItem = require('../../models/InventoryItem');

// Scaffold module: full CRUD wired up now, procurement/approval workflow comes later.
const ctrl = crudFactory(InventoryItem, { label: 'Inventory item' });

const requestRestock = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const item = await InventoryItem.findById(req.params.id);
  if (!item) return fail(res, 'Inventory item not found.', 404);

  item.restockRequests.push({ requestedBy: req.user._id, quantity });
  await item.save();
  return ok(res, item, 'Restock requested.');
});

router.use(protect);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorize(ROLES.MANAGER), ctrl.createOne);
router.put('/:id', authorize(ROLES.MANAGER), ctrl.updateOne);
router.delete('/:id', authorize(ROLES.MANAGER), ctrl.removeOne);
router.post('/:id/restock-request', authorize(ROLES.GROOM, ROLES.HEAD_TRAINER, ROLES.VETERINARIAN), requestRestock);

module.exports = router;
