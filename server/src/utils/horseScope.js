const Horse = require('../models/Horse');
const { ROLES } = require('../constants/roles');

const SCOPE_FIELD_BY_ROLE = {
  [ROLES.OWNER]: 'owner',
  [ROLES.HEAD_TRAINER]: 'assignedTrainer',
  [ROLES.VETERINARIAN]: 'assignedVet',
};

const FORBIDDEN_HORSE_MESSAGE = 'Forbidden: this horse is not assigned to you.';

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

/**
 * The `horse` clause for a list query, honouring an optional `?horse=` filter. Returns undefined
 * when there's nothing to filter by. An out-of-scope `?horse=` yields an empty result rather than
 * a 403, so a list page never errors just because a stale filter is in the URL.
 */
async function horseFilter(user, requestedHorse) {
  const scopedIds = await getScopedHorseIds(user);
  if (requestedHorse) return isHorseInScope(scopedIds, requestedHorse) ? requestedHorse : { $in: [] };
  return scopedIds ? { $in: scopedIds } : undefined;
}

/**
 * Whether the user may act on one specific horse. Every by-id read and every write goes through
 * this — list endpoints alone being scoped meant anyone who knew an id could still open, edit or
 * delete another trainer's records.
 */
async function canAccessHorse(user, horseId) {
  if (!horseId) return false;
  const field = SCOPE_FIELD_BY_ROLE[user.role];
  if (!field) return true;
  return Boolean(await Horse.exists({ _id: horseId, [field]: user._id }));
}

module.exports = { getScopedHorseIds, isHorseInScope, horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE };
