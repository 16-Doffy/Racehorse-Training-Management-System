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
  MobileOutlined,
  AppstoreOutlined,
  CarryOutOutlined,
  WarningOutlined,
  BarChartOutlined,
  AlertOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { ROLES } from '../../constants/roles';

// Menu definitions per role. Every entry maps to a real route (core flows link to their real
// page, scaffold modules link to a ComingSoonPage) so the Sider never dead-ends.
const MENUS = {
  [ROLES.MANAGER]: [
    { key: 'dashboard', icon: <DashboardOutlined />, label: 'Tổng quan', path: '/' },
    { key: 'users', icon: <TeamOutlined />, label: 'Quản lý Nhân sự & RBAC', path: '/admin/users' },
    { key: 'horses', icon: <ProfileOutlined />, label: 'Danh mục Ngựa', path: '/horses' },
    { key: 'stables', icon: <HomeOutlined />, label: 'Chuồng trại & NV chăm sóc', path: '/admin/stables' },
    { key: 'reports', icon: <BarChartOutlined />, label: 'Báo cáo Tổng quan', path: '/admin/reports' },
    { key: 'inventory', icon: <ShoppingOutlined />, label: 'Vật tư & Thức ăn', path: '/inventory' },
    { key: 'finance', icon: <DollarOutlined />, label: 'Báo cáo Tài chính', path: '/finance' },
    { key: 'audit', icon: <FileTextOutlined />, label: 'Nhật ký Hệ thống', path: '/admin/audit-logs' },
  ],
  [ROLES.HEAD_TRAINER]: [
    { key: 'dashboard', icon: <DashboardOutlined />, label: 'Tổng quan', path: '/' },
    { key: 'horses', icon: <ProfileOutlined />, label: 'Danh sách Ngựa', path: '/horses' },
    { key: 'training-plans', icon: <ScheduleOutlined />, label: 'Kế hoạch Huấn luyện', path: '/training/plans' },
    { key: 'training-sessions', icon: <ScheduleOutlined />, label: 'Buổi Tập & Đánh giá', path: '/training/sessions' },
    { key: 'stable-tasks', icon: <HomeOutlined />, label: 'Chuồng trại & Chăm sóc', path: '/stable/tasks' },
    { key: 'races', icon: <TrophyOutlined />, label: 'Đăng ký Giải đua', path: '/races' },
  ],
  // The vet's day: the queue first, then the horses, and one place each for treatments (the
  // prescription and the training level live in the same form), injuries, routine care and the
  // examination tools the vet keeps. Medicines are the groom's stock: the vet only prescribes them.
  [ROLES.VETERINARIAN]: [
    { key: 'dashboard', icon: <CarryOutOutlined />, label: 'Việc hôm nay', path: '/veterinarian' },
    { key: 'horses', icon: <ProfileOutlined />, label: 'Ngựa & hồ sơ', path: '/veterinarian/horses' },
    { key: 'treatments', icon: <MedicineBoxOutlined />, label: 'Điều trị & đơn thuốc', path: '/veterinarian/treatments' },
    { key: 'injuries', icon: <AlertOutlined />, label: 'Chấn thương', path: '/veterinarian/injuries' },
    { key: 'schedules', icon: <CalendarOutlined />, label: 'Lịch chăm sóc', path: '/veterinarian/schedules' },
    { key: 'inventory', icon: <ToolOutlined />, label: 'Dụng cụ khám', path: '/veterinarian/inventory' },
  ],
  // Groom / Stable Hand works from the Expo mobile app (/mobile), so the web menu only carries
  // the notice that points there.
  [ROLES.GROOM]: [{ key: 'dashboard', icon: <MobileOutlined />, label: 'Dùng trên điện thoại', path: '/' }],
  // The owner follows their horses: one page per part of a horse's life at the club. The trainer's
  // reviews are the "Nhận xét HLV" tab of the training page.
  [ROLES.OWNER]: [
    { key: 'dashboard', icon: <DashboardOutlined />, label: 'Tổng quan', path: '/' },
    { key: 'my-horses', icon: <ProfileOutlined />, label: 'Ngựa của tôi', path: '/horses' },
    { key: 'owner-health', icon: <HeartOutlined />, label: 'Sức khỏe', path: '/owner/health' },
    { key: 'owner-training', icon: <CalendarOutlined />, label: 'Huấn luyện', path: '/owner/training' },
    { key: 'owner-races', icon: <TrophyOutlined />, label: 'Giải đua', path: '/owner/races' },
    { key: 'owner-stable', icon: <HomeOutlined />, label: 'Chuồng & chăm sóc', path: '/owner/stable' },
    { key: 'finance', icon: <DollarOutlined />, label: 'Thu chi', path: '/finance' },
  ],
};

export function getMenuByRole(role) {
  return MENUS[role] || [];
}
