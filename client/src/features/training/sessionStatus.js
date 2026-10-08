// One vocabulary for a training session's status, shared by every screen that shows one.
// Statuses are the server's (lowercase snake_case); only the wording is ours.

export const SESSION_STATUS_LABELS = {
  scheduled: 'Đã lên lịch',
  ready: 'Sẵn sàng',
  blocked: 'Bị chặn',
  in_progress: 'Đang diễn ra',
  completed: 'Đã hoàn thành',
  evaluated: 'Đã đánh giá',
  aborted: 'Đã dừng giữa chừng',
  cancelled: 'Đã hủy',
  missed: 'Đã lỡ giờ',
};

// Colours for antd <Tag>.
export const SESSION_STATUS_COLORS = {
  scheduled: 'default',
  ready: 'cyan',
  blocked: 'orange',
  in_progress: 'processing',
  completed: 'success',
  evaluated: 'success',
  aborted: 'volcano',
  cancelled: 'error',
  missed: 'default',
};

// Same, for antd <Badge status>, which only knows five colours.
export const SESSION_BADGE_STATUS = {
  scheduled: 'default',
  ready: 'processing',
  blocked: 'warning',
  in_progress: 'processing',
  completed: 'success',
  evaluated: 'success',
  aborted: 'error',
  cancelled: 'error',
  missed: 'default',
};

// Booked or running, i.e. not yet finished one way or another.
export const OPEN_SESSION_STATUSES = ['scheduled', 'ready', 'blocked', 'in_progress'];
export const isOpenSession = (session) => OPEN_SESSION_STATUSES.includes(session?.status);
