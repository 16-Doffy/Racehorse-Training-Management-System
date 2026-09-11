// Mirrors server/src/constants/roles.js — keep both in sync.
export const ROLES = Object.freeze({
  HEAD_TRAINER: 'head_trainer',
  VETERINARIAN: 'veterinarian',
  GROOM: 'groom',
  OWNER: 'owner',
  MANAGER: 'manager',
});

export const ROLE_LABELS = {
  [ROLES.HEAD_TRAINER]: 'Head Trainer',
  [ROLES.VETERINARIAN]: 'Veterinarian',
  [ROLES.GROOM]: 'Groom / Stable Hand',
  [ROLES.OWNER]: 'Horse Owner',
  [ROLES.MANAGER]: 'Club Manager',
};
