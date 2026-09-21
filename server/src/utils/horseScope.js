const Horse = require('../models/Horse');
const { ROLES } = require('../constants/roles');

const SCOPE_FIELD_BY_ROLE = {
  [ROLES.OWNER]: 'owner',
  [ROLES.HEAD_TRAINER]: 'assignedTrainer',
  [ROLES.VETERINARIAN]: 'assignedVet',
};

/**
 * Returns the set of horse ids a user is allowed to see/act on, or `null` when the role has no
 * such restriction (Manager sees everything; Groom is scoped separately via DailyTask.assignedTo,
 * not through this horse-level mechanism).
 *
 * For Owner/Head Trainer/Veterinarian, "allowed" means horses assigned to them specifically PLUS
 * any horse nobody has been assigned to yet — so a horse stays visible to everyone in that role
 * until a Manager deliberately assigns it, instead of disappearing the moment this scoping field
 * exists on the schema (this matters for every horse already in the shared database today, none
 * of which has assignedTrainer/assignedVet set).
 */
async function getScopedHorseIds(user) {
  const field = SCOPE_FIELD_BY_ROLE[user.role];
  if (!field) return null;

  const horses = await Horse.find({ $or: [{ [field]: user._id }, { [field]: null }] }).select('_id');
  return horses.map((h) => h._id);
}

/** True when `horseId` is inside `scopedIds`, or when `scopedIds` is null (no restriction). */
function isHorseInScope(scopedIds, horseId) {
  if (scopedIds === null) return true;
  return scopedIds.some((id) => String(id) === String(horseId));
}

module.exports = { getScopedHorseIds, isHorseInScope };
