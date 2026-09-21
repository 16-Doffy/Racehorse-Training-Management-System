// Mirrors server/src/constants/roles.js — keep both in sync.
export const ROLES = Object.freeze({
  HEAD_TRAINER: 'head_trainer',
  VETERINARIAN: 'veterinarian',
  GROOM: 'groom',
  OWNER: 'owner',
  MANAGER: 'manager',
});

export const ROLE_LABELS = {
  [ROLES.HEAD_TRAINER]: 'Huấn luyện viên Trưởng',
  [ROLES.VETERINARIAN]: 'Bác sĩ Thú y',
  [ROLES.GROOM]: 'Nhân viên Chăm sóc',
  [ROLES.OWNER]: 'Chủ sở hữu Ngựa',
  [ROLES.MANAGER]: 'Quản lý Câu lạc bộ',
};

/** One-line description of what each role does, shown when picking a role at registration. */
export const ROLE_DESCRIPTIONS = {
  [ROLES.HEAD_TRAINER]: 'Lập kế hoạch huấn luyện, theo dõi buổi tập, phân công chăm sóc',
  [ROLES.VETERINARIAN]: 'Khám bệnh, kê phác đồ điều trị, khóa huấn luyện khi cần',
  [ROLES.GROOM]: 'Thực hiện công việc chăm sóc hàng ngày, báo cáo sự cố',
  [ROLES.OWNER]: 'Theo dõi ngựa mình sở hữu: sức khỏe, huấn luyện, chi phí',
  [ROLES.MANAGER]: 'Quản lý nhân sự, danh mục ngựa, vật tư và báo cáo toàn CLB',
};
