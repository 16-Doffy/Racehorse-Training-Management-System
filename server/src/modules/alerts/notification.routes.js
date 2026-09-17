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

router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const notifications = await Notification.find(myFilter(req.user))
      .populate('horse', 'name')
      .sort({ createdAt: -1 })
      .limit(100);
    return ok(res, notifications, 'Notifications fetched.');
  })
);

router.patch(
  '/read-all',
  protect,
  asyncHandler(async (req, res) => {
    const result = await Notification.updateMany({ ...myFilter(req.user), isRead: false }, { isRead: true });
    return ok(res, { matched: result.matchedCount }, 'All notifications marked as read.');
  })
);

router.patch(
  '/:id/read',
  protect,
  asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...myFilter(req.user) },
      { isRead: true },
      { new: true }
    );
    if (!notification) return fail(res, 'Notification not found.', 404);
    return ok(res, notification, 'Notification marked as read.');
  })
);

module.exports = router;
