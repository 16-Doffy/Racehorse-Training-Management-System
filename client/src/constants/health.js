// A horse's health status as the vet concluded it. Shared by every screen that shows it, so the
// same status never reads differently from one page to the next.
export const HEALTH_LABELS = {
  eligible: 'Đủ điều kiện',
  monitoring: 'Cần theo dõi',
  injured: 'Chấn thương',
  quarantined: 'Cách ly',
};

export const HEALTH_COLORS = { eligible: 'green', monitoring: 'gold', injured: 'red', quarantined: 'volcano' };

// How hard a horse may be worked while it is treated (horse.trainingClearance.level, set by the vet
// on the treatment): the lock, two recovery steps, and no restriction. Same words on every screen.
export const TRAINING_LEVEL_META = {
  none: { label: 'Khóa huấn luyện', short: '🔒 Khóa huấn luyện', color: 'red' },
  light: { label: 'Hồi phục — chỉ tập nhẹ', short: '🩹 Chỉ tập nhẹ', color: 'orange' },
  moderate: { label: 'Hồi phục — tối đa cường độ vừa', short: '🩹 Tối đa cường độ vừa', color: 'gold' },
  high: { label: 'Đủ điều kiện tập luyện', short: 'Đủ điều kiện', color: 'green' },
};
export const LEVEL_RANK = { none: 0, light: 1, moderate: 2, high: 3 };
export const INTENSITY_RANK = { light: 1, moderate: 2, high: 3 };
/** Whether a session of this intensity fits the horse's clearance. */
export const intensityAllowed = (clearance, intensity) =>
  !clearance || !intensity || (INTENSITY_RANK[intensity] || 0) <= LEVEL_RANK[clearance.level ?? 'high'];
