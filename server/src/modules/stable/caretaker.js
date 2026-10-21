const { ROLES } = require('../../constants/roles');

/** The caretaker fields to populate on a stall assignment to tell whether that person still looks after the horse. */
const CARETAKER_FIELDS = 'name role isActive';

/**
 * Why the caretaker named on a stall assignment can no longer look after the horse, or '' when they
 * can. Locking an account or moving it to another role leaves the assignment pointing at that person;
 * the training readiness gate, the horse checklist and the Manager's queue all ask this, so the horse
 * shows as needing a new caretaker everywhere. A deleted account populates as null, which callers
 * already treat as no caretaker.
 */
function caretakerProblem(caretaker) {
  if (!caretaker) return '';
  if (!caretaker.isActive) return 'tài khoản đã bị khóa';
  if (caretaker.role !== ROLES.GROOM) return 'không còn là nhân viên chăm sóc';
  return '';
}

module.exports = { CARETAKER_FIELDS, caretakerProblem };
