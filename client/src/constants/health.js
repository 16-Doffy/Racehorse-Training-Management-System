// A horse's health status as the vet concluded it. Shared by every screen that shows it, so the
// same status never reads differently from one page to the next.
export const HEALTH_LABELS = {
  eligible: 'Đủ điều kiện',
  monitoring: 'Cần theo dõi',
  injured: 'Chấn thương',
  quarantined: 'Cách ly',
};

export const HEALTH_COLORS = { eligible: 'green', monitoring: 'gold', injured: 'red', quarantined: 'volcano' };
