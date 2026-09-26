const Notification = require('../../models/Notification');
const { getIO } = require('../../realtime/socketServer');

/**
 * Single entry point for "create a Notification and push it live" — used by every notification
 * source (fitness alerts, care-schedule reminders, emergency training locks, incident reports).
 * Before this, each caller duplicated the create-then-emit logic with its own ad-hoc socket event
 * name (`fitness:alert`, `care:due`, or — for training locks — no realtime push at all, so the
 * recipient only ever saw it by manually opening the bell). Everything now emits one generic
 * `notification:new` event carrying the populated notification, so the client has a single place
 * to listen and a consistent shape regardless of what triggered it.
 *
 * `rooms` lets a caller target more than the recipient alone (e.g. also `horse:<id>` so an Owner
 * watching that horse gets it too) — recipientRole/recipientUser are always included automatically.
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

module.exports = { pushNotification };
