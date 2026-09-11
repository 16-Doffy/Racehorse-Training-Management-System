const asyncHandler = require('./asyncHandler');
const { ok, created, fail } = require('./apiResponse');

/**
 * Generic CRUD controller factory for straightforward scaffold modules (feeding, inventory,
 * race, finance) that don't yet need bespoke business logic. Swap any handler out for a custom
 * one in the module's own controller once real requirements land.
 */
function crudFactory(Model, { populate = [], defaultSort = { createdAt: -1 }, label = 'Item' } = {}) {
  const list = asyncHandler(async (req, res) => {
    const { horse } = req.query;
    const filter = horse ? { horse } : {};
    const items = await Model.find(filter).populate(populate).sort(defaultSort);
    return ok(res, items, `${label}s fetched.`);
  });

  const getOne = asyncHandler(async (req, res) => {
    const item = await Model.findById(req.params.id).populate(populate);
    if (!item) return fail(res, `${label} not found.`, 404);
    return ok(res, item, `${label} fetched.`);
  });

  const createOne = asyncHandler(async (req, res) => {
    const item = await Model.create(req.body);
    return created(res, item, `${label} created.`);
  });

  const updateOne = asyncHandler(async (req, res) => {
    const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) return fail(res, `${label} not found.`, 404);
    return ok(res, item, `${label} updated.`);
  });

  const removeOne = asyncHandler(async (req, res) => {
    const item = await Model.findByIdAndDelete(req.params.id);
    if (!item) return fail(res, `${label} not found.`, 404);
    return ok(res, null, `${label} deleted.`);
  });

  return { list, getOne, createOne, updateOne, removeOne };
}

module.exports = crudFactory;
