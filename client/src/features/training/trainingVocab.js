// What a training session is for, in the trainer's own words. The descriptions are shown in the
// scheduling form because "interval" on its own tells a reader nothing about why the horse is
// running — which was exactly the gap reviewers pointed at.
export const OBJECTIVE_LABELS = {
  endurance: 'Tăng sức bền',
  speed: 'Tăng tốc độ',
  interval: 'Chạy biến tốc',
  recovery: 'Hồi phục nhẹ',
  technique: 'Kỹ thuật',
  race_simulation: 'Mô phỏng thi đấu',
};

export const OBJECTIVE_DESCRIPTIONS = {
  endurance: 'Chạy dài, tốc độ đều — xây nền thể lực, tăng dung tích tim phổi.',
  speed: 'Cự ly ngắn, tốc độ tối đa — rèn sức bật và tốc độ nước rút.',
  interval: 'Xen kẽ hiệp nhanh và nghỉ — nâng ngưỡng chịu đựng, giống nhịp một cuộc đua.',
  recovery: 'Đi bộ hoặc chạy chậm — giãn cơ, hồi phục sau buổi nặng hoặc sau chấn thương.',
  technique: 'Tập xuất phát, vào cua, phối hợp với nài — không nhắm vào thể lực.',
  race_simulation: 'Chạy đủ cự ly thi đấu với tốc độ thật — kiểm tra độ sẵn sàng trước giải.',
};

export const OBJECTIVE_COLORS = {
  endurance: 'blue',
  speed: 'volcano',
  interval: 'purple',
  recovery: 'green',
  technique: 'cyan',
  race_simulation: 'magenta',
};

export const INTENSITY_LABELS = { light: 'Nhẹ', moderate: 'Vừa', high: 'Cao' };
export const INTENSITY_COLORS = { light: 'green', moderate: 'gold', high: 'red' };

export const PHASE_LABELS = {
  base_building: 'Xây nền thể lực',
  strength: 'Tăng sức mạnh',
  speed: 'Tăng tốc độ',
  peak: 'Đỉnh phong độ',
  recovery: 'Hồi phục',
};

export const objectiveOptions = Object.entries(OBJECTIVE_LABELS).map(([value, label]) => ({
  value,
  label,
  description: OBJECTIVE_DESCRIPTIONS[value],
}));

export const intensityOptions = Object.entries(INTENSITY_LABELS).map(([value, label]) => ({ value, label }));

export const SURFACE_LABELS = { turf: 'Cỏ (Turf)', dirt: 'Đất (Dirt)', synthetic: 'Tổng hợp', sand: 'Cát' };
export const surfaceOptions = Object.entries(SURFACE_LABELS).map(([value, label]) => ({ value, label }));

// A plan's lifecycle. Only draft/active plans accept new sessions (enforced by the server).
export const PLAN_STATUS_LABELS = { draft: 'Nháp', active: 'Đang áp dụng', completed: 'Đã hoàn thành', cancelled: 'Đã hủy' };
export const PLAN_STATUS_COLORS = { draft: 'default', active: 'blue', completed: 'green', cancelled: 'red' };
export const planStatusOptions = Object.entries(PLAN_STATUS_LABELS).map(([value, label]) => ({ value, label }));

export const phaseOptions = Object.entries(PHASE_LABELS).map(([value, label]) => ({ value, label }));
