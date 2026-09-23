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
 * Owner/Head Trainer/Veterinarian see ONLY the horses assigned to them — strictly. An unassigned
 * horse is deliberately visible to nobody but the Manager: the Manager is the one who decides who
 * handles which horse, and a horse quietly showing up on every trainer's screen until someone
 * remembers to assign it would make the assignment step look like it does nothing. Manager's
 * dashboard surfaces unassigned horses so they can't be forgotten instead.
 */
async function getScopedHorseIds(user) {
  const field = SCOPE_FIELD_BY_ROLE[user.role];
  if (!field) return null;

  const horses = await Horse.find({ [field]: user._id }).select('_id');
  return horses.map((h) => h._id);
}

/** True when `horseId` is inside `scopedIds`, or when `scopedIds` is null (no restriction). */
function isHorseInScope(scopedIds, horseId) {
  if (scopedIds === null) return true;
  return scopedIds.some((id) => String(id) === String(horseId));
}

module.exports = { getScopedHorseIds, isHorseInScope };
