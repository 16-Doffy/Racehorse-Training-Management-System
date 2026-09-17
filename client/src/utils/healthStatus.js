/**
 * Constants and helpers for health statuses, injury severity, recovery status, and treatment status.
 */

export const HEALTH_STATUSES = {
  ELIGIBLE: 'eligible',
  MONITORING: 'monitoring',
  INJURED: 'injured',
  QUARANTINED: 'quarantined',
  ISOLATED: 'quarantined', // Synonym mapping
};

export const HEALTH_STATUS_CONFIG = {
  eligible: {
    label: 'Đủ điều kiện (Eligible)',
    badgeBg: 'success',
    color: '#198754',
    icon: 'bi-check-circle-fill',
    description: 'Ngựa đủ điều kiện tham gia luyện tập và thi đấu bình thường.',
  },
  monitoring: {
    label: 'Cần theo dõi (Monitoring)',
    badgeBg: 'warning',
    color: '#ffc107',
    icon: 'bi-exclamation-triangle-fill',
    description: 'Ngựa đang được theo dõi thể lực, sức khỏe nhẹ.',
  },
  injured: {
    label: 'Chấn thương (Injured)',
    badgeBg: 'danger',
    color: '#dc3545',
    icon: 'bi-bandaid-fill',
    description: 'Ngựa gặp chấn thương, cần điều trị và hạn chế tải trọng.',
  },
  quarantined: {
    label: 'Cách ly (Isolated/Quarantined)',
    badgeBg: 'dark',
    color: '#212529',
    icon: 'bi-shield-slash-fill',
    description: 'Ngựa đang bị cách ly y tế để kiểm dịch hoặc điều trị lây nhiễm.',
  },
};

export const INJURY_SEVERITY_CONFIG = {
  mild: { label: 'Nhẹ (Mild)', bg: 'info', text: 'dark' },
  moderate: { label: 'Trung bình (Moderate)', bg: 'warning', text: 'dark' },
  severe: { label: 'Nghiêm trọng (Severe)', bg: 'danger', text: 'white' },
};

export const RECOVERY_STATUS_CONFIG = {
  new: { label: 'Mới phát hiện', bg: 'danger' },
  in_treatment: { label: 'Đang điều trị', bg: 'warning' },
  recovering: { label: 'Đang hồi phục', bg: 'info' },
  recovered: { label: 'Đã bình phục', bg: 'success' },
};

export const TREATMENT_STATUS_CONFIG = {
  planned: { label: 'Đã lên kế hoạch', bg: 'secondary' },
  ongoing: { label: 'Đang điều trị', bg: 'primary' },
  completed: { label: 'Hoàn thành', bg: 'success' },
  cancelled: { label: 'Đã hủy', bg: 'danger' },
};

export function getHealthStatusInfo(status) {
  const key = (status || '').toLowerCase();
  if (key === 'isolated') return HEALTH_STATUS_CONFIG.quarantined;
  return HEALTH_STATUS_CONFIG[key] || {
    label: status || 'Không rõ',
    badgeBg: 'secondary',
    color: '#6c757d',
    icon: 'bi-question-circle',
    description: '',
  };
}
