import {
  DashboardOutlined,
  ScheduleOutlined,
  MedicineBoxOutlined,
  HomeOutlined,
  TeamOutlined,
  FileTextOutlined,
  ShoppingOutlined,
  AppleOutlined,
  TrophyOutlined,
  DollarOutlined,
  ProfileOutlined,
  HeartOutlined,
  CalendarOutlined,
  StarOutlined,
  AppstoreOutlined,
  CarryOutOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { ROLES } from '../../constants/roles';

// Menu definitions per role. Every entry maps to a real route (core flows link to their real
// page, scaffold modules link to a ComingSoonPage) so the Sider never dead-ends.
const MENUS = {
  [ROLES.MANAGER]: [
    { key: 'dashboard', icon: <DashboardOutlined />, label: 'Tổng quan', path: '/' },
    { key: 'users', icon: <TeamOutlined />, label: 'Quản lý Nhân sự & RBAC', path: '/admin/users' },
    { key: 'horses', icon: <ProfileOutlined />, label: 'Danh mục Ngựa', path: '/horses' },
    { key: 'inventory', icon: <ShoppingOutlined />, label: 'Vật tư & Thức ăn', path: '/inventory' },
    { key: 'finance', icon: <DollarOutlined />, label: 'Báo cáo Tài chính', path: '/finance' },
    { key: 'audit', icon: <FileTextOutlined />, label: 'Nhật ký Hệ thống', path: '/admin/audit-logs' },
  ],
  [ROLES.HEAD_TRAINER]: [
    { key: 'dashboard', icon: <DashboardOutlined />, label: 'Tổng quan', path: '/' },
    { key: 'horses', icon: <ProfileOutlined />, label: 'Danh sách Ngựa', path: '/horses' },
    { key: 'training-plans', icon: <ScheduleOutlined />, label: 'Kế hoạch Huấn luyện', path: '/training/plans' },
    { key: 'training-sessions', icon: <ScheduleOutlined />, label: 'Buổi Tập & Đánh giá', path: '/training/sessions' },
    { key: 'stable-tasks', icon: <HomeOutlined />, label: 'Phân công Chuồng trại', path: '/stable/tasks' },
    { key: 'races', icon: <TrophyOutlined />, label: 'Đăng ký Giải đua', path: '/races' },
  ],
  [ROLES.VETERINARIAN]: [
    { key: 'dashboard', icon: <DashboardOutlined />, label: 'Bảng Điều Khiển Thú Y', path: '/veterinarian' },
    { key: 'horses', icon: <ProfileOutlined />, label: 'Sức Khỏe Chiến Mã', path: '/veterinarian/horses' },
    { key: 'injuries', icon: <MedicineBoxOutlined />, label: 'Quản Lý Chấn Thương', path: '/veterinarian/injuries' },
    { key: 'treatments', icon: <MedicineBoxOutlined />, label: 'Phác Đồ & Khóa Tập', path: '/veterinarian/treatments' },
    { key: 'prescriptions', icon: <MedicineBoxOutlined />, label: 'Kê Đơn Thuốc', path: '/veterinarian/prescriptions' },
    { key: 'schedules', icon: <ScheduleOutlined />, label: 'Lịch Y Tế & Móng', path: '/veterinarian/schedules' },
  ],
  [ROLES.GROOM]: [
    { key: 'dashboard', icon: <DashboardOutlined />, label: 'Tổng quan', path: '/' },
    { key: 'stable-map', icon: <AppstoreOutlined />, label: 'Sơ đồ Chuồng trại', path: '/stable/map' },
    { key: 'my-tasks', icon: <CarryOutOutlined />, label: 'Việc Hàng ngày', path: '/stable/my-tasks' },
    { key: 'feeding', icon: <AppleOutlined />, label: 'Khẩu phần Ăn', path: '/feeding' },
    { key: 'incidents', icon: <WarningOutlined />, label: 'Báo cáo Sự cố', path: '/stable/incidents' },
    { key: 'supplies', icon: <ShoppingOutlined />, label: 'Vật tư Khu vực', path: '/stable/supplies' },
  ],
  [ROLES.OWNER]: [
    { key: 'dashboard', icon: <DashboardOutlined />, label: 'Tổng quan', path: '/' },
    { key: 'my-horses', icon: <ProfileOutlined />, label: 'Ngựa của tôi', path: '/horses' },
    { key: 'owner-health', icon: <HeartOutlined />, label: 'Sức khỏe Ngựa', path: '/owner/health' },
    { key: 'owner-training', icon: <CalendarOutlined />, label: 'Lịch Huấn luyện', path: '/owner/training' },
    { key: 'owner-evaluations', icon: <StarOutlined />, label: 'Đánh giá HLV', path: '/owner/evaluations' },
    { key: 'finance', icon: <DollarOutlined />, label: 'Chi phí & Doanh thu', path: '/finance' },
  ],
};

export function getMenuByRole(role) {
  return MENUS[role] || [];
}
