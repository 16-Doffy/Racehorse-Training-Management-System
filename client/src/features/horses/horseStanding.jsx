import { AlertOutlined, CheckCircleOutlined, MedicineBoxOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { HEALTH_LABELS, TRAINING_LEVEL_META } from '../../constants/health';
import { breedLabel } from './horse3d/horseBreeds';

/** "4 tuổi", or "7 tháng" for a horse under a year; null without a date of birth. */
export function ageOf(dob) {
  if (!dob) return null;
  const years = dayjs().diff(dayjs(dob), 'year');
  return years > 0 ? `${years} tuổi` : `${dayjs().diff(dayjs(dob), 'month')} tháng`;
}

/** The breed in Vietnamese, without the English in brackets ("Thuần chủng Anh"). */
export const breedVi = (breed) => (breed ? breedLabel(breed).split(' (')[0] : null);

/**
 * Where the horse stands, in a word and a colour: held for an exam, off work, never examined, limited, being
 * watched, or fit. `examined`: true / false, or undefined while that is still loading.
 */
export function standingOf(h, examined) {
  const c = h.trainingClearance || { level: 'high' };
  if (h.examHold) return { tone: 'danger', label: 'Chờ bác sĩ khám', training: 'Tạm dừng tập', icon: <AlertOutlined /> };
  if (['injured', 'quarantined'].includes(h.healthStatus) || c.level === 'none') {
    return { tone: 'danger', label: HEALTH_LABELS[h.healthStatus] || 'Khóa tập', training: 'Không được tập', icon: <WarningOutlined /> };
  }
  if (examined === false) return { tone: 'warn', label: 'Chưa khám', training: 'Bài nặng cần giấy khám', icon: <MedicineBoxOutlined /> };
  if (c.restricted) return { tone: 'warn', label: HEALTH_LABELS[h.healthStatus] || 'Hạn chế tập', training: TRAINING_LEVEL_META[c.level]?.label || 'Hạn chế tập', icon: <WarningOutlined /> };
  if (h.healthStatus === 'monitoring') return { tone: 'warn', label: HEALTH_LABELS.monitoring, training: 'Tập bình thường, cần theo dõi', icon: <AlertOutlined /> };
  return { tone: 'good', label: HEALTH_LABELS.eligible || 'Đủ điều kiện', training: 'Tập bình thường', icon: <CheckCircleOutlined /> };
}
