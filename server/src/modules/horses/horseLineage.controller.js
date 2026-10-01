const Horse = require('../../models/Horse');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, fail } = require('../../utils/apiResponse');
const { canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');

const MAX_GENERATIONS = 4;
const FIELDS = 'name breed color dob sire dam achievements';

/**
 * One node of the pedigree tree, with its parents down to `depth` more generations. A parent
 * missing from the club's records is null — the tree just stops there.
 */
async function buildNode(id, depth, seen) {
  if (!id || seen.has(String(id))) return null; // a cycle would be a data error; don't loop on it
  const horse = await Horse.findById(id).select(FIELDS);
  if (!horse) return null;
  seen.add(String(horse._id));

  const node = {
    _id: horse._id,
    name: horse.name,
    breed: horse.breed,
    color: horse.color,
    dob: horse.dob,
    achievements: (horse.achievements || []).length,
    sire: null,
    dam: null,
  };
  if (depth > 0) {
    [node.sire, node.dam] = await Promise.all([buildNode(horse.sire, depth - 1, seen), buildNode(horse.dam, depth - 1, seen)]);
  }
  return node;
}

// GET /horses/:id/lineage?generations=3 — sire/dam tree (up to 4 generations back).
const getLineage = asyncHandler(async (req, res) => {
  if (!(await canAccessHorse(req.user, req.params.id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  const generations = Math.min(Math.max(parseInt(req.query.generations, 10) || 3, 1), MAX_GENERATIONS);
  const tree = await buildNode(req.params.id, generations, new Set());
  if (!tree) return fail(res, 'Horse not found.', 404);
  return ok(res, { generations, tree }, 'Lineage fetched.');
});

module.exports = { getLineage };
