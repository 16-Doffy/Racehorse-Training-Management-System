const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, fail } = require('../../utils/apiResponse');
const Notification = require('../../models/Notification');

// A notification belongs to the current user if it was addressed to them directly, or to
// their role broadly (e.g. "all head trainers").
const myFilter = (user) => ({
  $or: [{ recipientUser: user._id }, { recipientRole: user.role }],
});

/** `isRead` as the client has always received it, but computed per user for role-wide rows. */
function withPersonalReadState(notification, user) {
  const plain = notification.toObject();
  if (plain.recipientRole && !plain.recipientUser) {
    plain.isRead = (plain.readBy || []).some((id) => String(id) === String(user._id));
  }
  delete plain.readBy;
  return plain;
}

/** Marks the given notifications read for this user only. */
async function markRead(user, extraFilter = {}) {
  const [direct, roleWide] = await Promise.all([
    Notification.updateMany({ ...extraFilter, recipientUser: user._id, isRead: false }, { isRead: true }),
    Notification.updateMany(
      { ...extraFilter, recipientRole: user.role, readBy: { $ne: user._id } },
      { $addToSet: { readBy: user._id } }
    ),
  ]);
  return direct.modifiedCount + roleWide.modifiedCount;
}

router.use(protect);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const notifications = await Notification.find(myFilter(req.user))
      .populate('horse', 'name')
      .sort({ createdAt: -1 })
      .limit(100);
    return ok(res, notifications.map((n) => withPersonalReadState(n, req.user)), 'Notifications fetched.');
  })
);

router.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    const matched = await markRead(req.user);
    return ok(res, { matched }, 'All notifications marked as read.');
  })
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const exists = await Notification.exists({ _id: req.params.id, ...myFilter(req.user) });
    if (!exists) return fail(res, 'Notification not found.', 404);
    await markRead(req.user, { _id: req.params.id });
    const notification = await Notification.findById(req.params.id).populate('horse', 'name');
    return ok(res, withPersonalReadState(notification, req.user), 'Notification marked as read.');
  })
);

module.exports = router;
