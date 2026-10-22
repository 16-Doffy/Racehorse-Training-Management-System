const { ROLES } = require('../../constants/roles');

/** The fields to populate on a person a horse is assigned to, to tell whether they still fill that role. */
const STAFF_FIELDS = 'name role isActive';
const CARETAKER_FIELDS = STAFF_FIELDS;

const ROLE_NAMES = {
  [ROLES.GROOM]: 'nhân viên chăm sóc',
  [ROLES.HEAD_TRAINER]: 'HLV',
  [ROLES.VETERINARIAN]: 'bác sĩ',
  [ROLES.OWNER]: 'chủ ngựa',
};

/**
 * Why the person a horse is assigned to (its owner, trainer, vet or groom) no longer fills that role,
 * or '' when they do. Locking an account or moving it to another role leaves the horse pointing at
 * that person; the training readiness gate, the horse checklist and the Manager's queue all ask this,
 * so the horse shows as needing someone new everywhere. A deleted account populates as null, which
 * callers already treat as nobody assigned.
 */
function staffProblem(person, role) {
  if (!person) return '';
  if (!person.isActive) return 'tài khoản đã bị khóa';
  if (role && person.role !== role) return `không còn là ${ROLE_NAMES[role] || role}`;
  return '';
}

/** staffProblem for the groom on a stall assignment. */
const caretakerProblem = (caretaker) => staffProblem(caretaker, ROLES.GROOM);

module.exports = { STAFF_FIELDS, CARETAKER_FIELDS, staffProblem, caretakerProblem };
