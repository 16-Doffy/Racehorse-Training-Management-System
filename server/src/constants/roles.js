const ROLES = Object.freeze({
  HEAD_TRAINER: 'head_trainer',
  VETERINARIAN: 'veterinarian',
  GROOM: 'groom',
  OWNER: 'owner',
  MANAGER: 'manager',
});

const ALL_ROLES = Object.values(ROLES);

module.exports = { ROLES, ALL_ROLES };
