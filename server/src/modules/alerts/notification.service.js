const Notification = require('../../models/Notification');
const Horse = require('../../models/Horse');
const { getIO } = require('../../realtime/socketServer');
const { ROLES } = require('../../constants/roles');

/**
 * Single entry point for "create a Notification and push it live" — used by every notification
 * source (fitness alerts, care-schedule reminders, emergency training locks, incident reports).
 * Everything emits one generic `notification:new` event carrying the populated notification, so
 * the client has a single place to listen and a consistent shape regardless of what triggered it.
 *
 * `extraRooms` lets a caller target more than the recipient alone (e.g. also `horse:<id>` so an
 * Owner watching that horse gets it too) — recipientRole/recipientUser are always included.
 */
async function pushNotification({ recipientUser, recipientRole, horse, trainingSession, type, severity = 'info', message, extraRooms = [] }) {
  const notification = await Notification.create({ recipientUser, recipientRole, horse, trainingSession, type, severity, message });
  const populated = await notification.populate('horse', 'name');

  const io = getIO();
  const rooms = [...extraRooms];
  if (recipientRole) rooms.push(`role:${recipientRole}`);
  if (recipientUser) rooms.push(`user:${recipientUser}`);

  const uniqueRooms = Array.from(new Set(rooms));
  if (uniqueRooms.length > 0) {
    io.to(uniqueRooms).emit('notification:new', populated);
  }

  return populated;
}

const STAFF_SLOTS = {
  trainer: { field: 'assignedTrainer', role: ROLES.HEAD_TRAINER },
  vet: { field: 'assignedVet', role: ROLES.VETERINARIAN },
};

/**
 * Notifies the trainer or vet responsible for one horse, falling back to the whole role only when
 * nobody has been assigned yet (so an unassigned horse's alert still reaches someone).
 *
 * Addressing the role by default used to send, say, a fitness alert to every Head Trainer in the
 * club — including ones who, under per-horse scoping, can't even open that horse.
 */
async function notifyHorseStaff({ horse, staff, ...payload }) {
  const slot = STAFF_SLOTS[staff];
  const doc = await Horse.findById(horse).select(slot.field);
  const assignee = doc?.[slot.field];

  return pushNotification({
    ...payload,
    horse,
    recipientUser: assignee || undefined,
    recipientRole: assignee ? undefined : slot.role,
  });
}

module.exports = { pushNotification, notifyHorseStaff };
