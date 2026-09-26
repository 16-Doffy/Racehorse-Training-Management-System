const asyncHandler = require('./asyncHandler');
const { ok, created, fail } = require('./apiResponse');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('./horseScope');

/**
 * Generic CRUD controller factory for straightforward modules (feeding, inventory, race, finance)
 * that don't need bespoke business logic. Swap any handler for a custom one in the module's own
 * controller once real requirements land.
 *
 * Options:
 * - `scopeByHorse`: apply the same per-role visibility rule the training/health modules use — an
 *   Owner sees only their own horses' records and a Head Trainer/Vet only those assigned to them.
 *   Applied to reads by id and to every write, not just the list: scoping only the list meant any
 *   trainer who knew an id could still edit or delete another trainer's race entry.
 * - `stamp(req, { isCreate })`: fields the server sets itself (e.g. who recorded it), so the client
 *   can't claim to be someone else. Return {} for the case that shouldn't change them.
 * - `afterWrite(item, req)`: hook for side effects that must follow a successful create/update.
 */
function crudFactory(
  Model,
  { populate = [], defaultSort = { createdAt: -1 }, label = 'Item', scopeByHorse = false, stamp, afterWrite } = {}
) {
  const denied = async (req, horseId) => scopeByHorse && !(await canAccessHorse(req.user, horseId));

  const list = asyncHandler(async (req, res) => {
    const filter = {};
    if (scopeByHorse) {
      const horse = await horseFilter(req.user, req.query.horse);
      if (horse !== undefined) filter.horse = horse;
    } else if (req.query.horse) {
      filter.horse = req.query.horse;
    }

    const items = await Model.find(filter).populate(populate).sort(defaultSort);
    return ok(res, items, `${label}s fetched.`);
  });

  const getOne = asyncHandler(async (req, res) => {
    const item = await Model.findById(req.params.id).populate(populate);
    if (!item) return fail(res, `${label} not found.`, 404);
    if (await denied(req, item.horse?._id || item.horse)) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
    return ok(res, item, `${label} fetched.`);
  });

  const createOne = asyncHandler(async (req, res) => {
    if (await denied(req, req.body.horse)) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
    const item = await Model.create({ ...req.body, ...(stamp ? stamp(req, { isCreate: true }) : {}) });
    if (afterWrite) await afterWrite(item, req);
    return created(res, item, `${label} created.`);
  });

  const updateOne = asyncHandler(async (req, res) => {
    const existing = await Model.findById(req.params.id);
    if (!existing) return fail(res, `${label} not found.`, 404);
    // Checked against both the current horse and any horse the update moves it to.
    if (await denied(req, existing.horse)) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
    if (req.body.horse && (await denied(req, req.body.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);

    const item = await Model.findByIdAndUpdate(
      req.params.id,
      { ...req.body, ...(stamp ? stamp(req, { isCreate: false }) : {}) },
      { new: true, runValidators: true }
    );
    if (afterWrite) await afterWrite(item, req, existing);
    return ok(res, item, `${label} updated.`);
  });

  const removeOne = asyncHandler(async (req, res) => {
    const existing = await Model.findById(req.params.id);
    if (!existing) return fail(res, `${label} not found.`, 404);
    if (await denied(req, existing.horse)) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
    await existing.deleteOne();
    return ok(res, null, `${label} deleted.`);
  });

  return { list, getOne, createOne, updateOne, removeOne };
}

module.exports = crudFactory;
