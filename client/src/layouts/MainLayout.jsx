import { ConfigProvider, Layout, Menu, Avatar, Dropdown, Typography, Button } from 'antd';
import { 
  UserOutlined, 
  LogoutOutlined, 
  PlusOutlined, 
  MailOutlined,
  AppstoreFilled,
  SettingOutlined,
  MoonOutlined,
  GithubOutlined,
  EllipsisOutlined
} from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { loggedOut } from '../features/auth/authSlice';
import { siderCollapsedSet } from '../store/uiSlice';
import { getMenuByRole } from './menuConfig';
import { ROLES, ROLE_LABELS } from '../constants/roles';
import AlertBell from '../features/alerts/AlertBell';
import { disconnectSocket } from '../lib/socket';
import { fileHref } from '../lib/files';
import { FOREST, MENU_SECTION_LABEL, forestTheme, usesForestTheme } from './forestTheme';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

/** Brass horseshoe shown as the logo on the forest sidebar. */
function HorseshoeMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={FOREST.brass} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0" aria-hidden="true">
      <path d="M7 20V9a5 5 0 0 1 10 0v11" />
      <path d="M4.5 20h4" />
      <path d="M15.5 20h4" />
      <path d="M7 13h2" />
      <path d="M15 13h2" />
    </svg>
  );
}

export default function MainLayout() {
  const { user } = useSelector((state) => state.auth);
  const { siderCollapsed } = useSelector((state) => state.ui);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = getMenuByRole(user?.role);
  const currentPath = location.pathname;
  // Club Manager and Head Trainer get the forest sidebar and warm page (forestTheme.js); the other
  // roles keep the light look below until their owners decide.
  const forest = usesForestTheme(user?.role);
  const pageBg = forest ? FOREST.page : '#FAFAFA';

  let activeItem = menuItems.find((m) => m.path === currentPath);
  if (!activeItem) {
    activeItem = menuItems.find((m) => m.path !== '/' && m.path !== '/veterinarian' && currentPath.startsWith(m.path));
    if (!activeItem && (currentPath.startsWith('/veterinarian/examinations') || currentPath.startsWith('/horses'))) {
      activeItem = menuItems.find((m) => m.key === 'horses');
    }
  }
  const selectedKey = activeItem?.key || menuItems[0]?.key;

  const handleLogout = () => {
    disconnectSocket();
    dispatch(loggedOut());
    navigate('/login', { replace: true });
  };

  const layout = (
    <Layout className={forest ? 'forest-layout' : undefined} style={{ height: '100vh', backgroundColor: pageBg }}>
      {/* SIDEBAR */}
      <Sider
        theme={forest ? 'dark' : 'light'}
        collapsible
        collapsed={siderCollapsed}
        onCollapse={(value) => dispatch(siderCollapsedSet(value))}
        breakpoint="md"
        width={260}
        className={forest ? 'custom-sider' : '!bg-white border-r border-gray-200 custom-sider'}
        trigger={null}
      >
        {/* Logo Area */}
        <div className="h-16 flex items-center px-6 shrink-0 pt-4">
          {forest ? <HorseshoeMark /> : <AppstoreFilled className="text-xl mr-2 text-gray-800" />}
          {!siderCollapsed && (
            <span className={`font-bold text-lg tracking-tight ${forest ? '' : 'text-gray-900'}`} style={forest ? { color: FOREST.logoText } : undefined}>
              Racehorse TMS
            </span>
          )}
        </div>



        {/* Menu Section */}
        <div className={`flex-1 overflow-y-auto mt-4 custom-sidebar-menu ${forest ? 'px-2 is-forest' : 'px-3 is-light'} min-h-0`}>
          {!siderCollapsed && (
            <div
              className={`px-3 text-xs font-semibold mb-2 uppercase ${forest ? 'tracking-wider' : 'text-gray-400'}`}
              style={forest ? { color: FOREST.siderMuted } : undefined}
            >
              {forest ? MENU_SECTION_LABEL[user?.role] : 'Dashboards'}
            </div>
          )}
          <Menu
            theme={forest ? 'dark' : 'light'}
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems.map((m) => ({ key: m.key, icon: m.icon, label: <span className="font-medium text-sm">{m.label}</span> }))}
            onClick={({ key }) => {
              const target = menuItems.find((m) => m.key === key);
              if (target) navigate(target.path);
            }}
            className={forest ? 'border-r-0' : 'border-r-0 !bg-white'}
          />
        </div>

        {/* Bottom Widgets */}
        {!siderCollapsed && (
          <div
            className={`p-4 shrink-0 mt-auto border-t ${forest ? '' : 'bg-white border-transparent'}`}
            style={forest ? { borderColor: FOREST.siderLine } : undefined}
          >
            {/* User Profile */}
            <Dropdown
              menu={{
                items: [
                  { key: 'profile', icon: <UserOutlined />, label: 'Hồ sơ cá nhân', onClick: () => navigate('/profile') },
                  { type: 'divider' },
                  { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: handleLogout },
                ],
              }}
              trigger={['click']}
              placement="topRight"
            >
              <div
                className={`flex items-center justify-between cursor-pointer p-2 -mx-2 rounded-lg transition-colors ${forest ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    className={forest ? 'font-bold' : 'bg-gray-200 text-gray-600 font-bold'}
                    style={forest ? { backgroundColor: FOREST.brass, color: FOREST.sider } : undefined}
                    size={36}
                    src={fileHref(user?.avatarUrl)}
                  >
                    {user?.name?.charAt(0)?.toUpperCase()}
                  </Avatar>
                  <div className="flex flex-col">
                    <span className={`font-semibold text-sm leading-tight ${forest ? '' : 'text-gray-900'}`} style={forest ? { color: FOREST.logoText } : undefined}>
                      {user?.name}
                    </span>
                    <span className={`text-xs ${forest ? '' : 'text-gray-500'}`} style={forest ? { color: FOREST.siderMuted } : undefined}>
                      {ROLE_LABELS[user?.role]}
                    </span>
                  </div>
                </div>
                <EllipsisOutlined className={`text-lg ${forest ? '' : 'text-gray-400'}`} style={forest ? { color: FOREST.siderMuted } : undefined} />
              </div>
            </Dropdown>
          </div>
        )}
      </Sider>

      {/* MAIN CONTENT AREA */}
      <Layout style={{ backgroundColor: pageBg, display: 'flex', flexDirection: 'column' }}>
        <div className="flex justify-end items-center px-4 pt-4 md:px-8 md:pt-6 shrink-0 bg-transparent">
          <AlertBell />
        </div>
        <Content
          style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
          className="p-4 md:px-8 md:pb-8 relative"
        >
          <Outlet />
        </Content>
      </Layout>
      <style>{`
        /* Fix Sider internal flex layout */
        .custom-sider .ant-layout-sider-children {
          display: flex;
          flex-direction: column;
        }

        /* Override Ant Design Menu styles to match the modern Studio Admin look */
        .custom-sidebar-menu.is-light .ant-menu-light {
          background: transparent !important;
        }
        .custom-sidebar-menu.is-light .ant-menu-item {
          height: 36px !important;
          line-height: 36px !important;
          border-radius: 8px !important;
          margin-top: 4px !important;
          margin-bottom: 4px !important;
          color: #4b5563 !important; /* gray-600 */
        }
        .custom-sidebar-menu.is-light .ant-menu-item:hover {
          background-color: #f3f4f6 !important; /* gray-100 */
          color: #111827 !important; /* gray-900 */
        }
        .custom-sidebar-menu.is-light .ant-menu-item-selected {
          background-color: #f3f4f6 !important; /* gray-100 */
          color: #111827 !important; /* gray-900 */
          font-weight: 600 !important;
        }
        /* Hide the blue indicator line in Ant Design */
        .custom-sidebar-menu .ant-menu-item::after {
          display: none !important;
        }

        /* Forest sidebar (Club Manager, Head Trainer): colours come from the Menu tokens in forestTheme.js */
        .custom-sidebar-menu.is-forest .ant-menu-dark {
          background: transparent !important;
        }
        .custom-sidebar-menu.is-forest .ant-menu-item {
          height: 38px !important;
          line-height: 38px !important;
          border-radius: 8px !important;
          margin-top: 3px !important;
          margin-bottom: 3px !important;
          /* Narrower padding so the longer labels ("Quản lý Nhân sự & RBAC") fit without an ellipsis */
          padding-inline: 12px !important;
        }
        .custom-sidebar-menu.is-forest .ant-menu-inline-collapsed .ant-menu-item {
          padding-inline: calc(50% - 8px) !important;
        }
        .custom-sidebar-menu.is-forest .ant-menu-title-content {
          margin-inline-start: 9px !important;
        }
        .custom-sidebar-menu.is-forest .ant-menu-title-content span {
          font-size: 13.5px;
        }
        .custom-sidebar-menu.is-forest .ant-menu-item-selected {
          font-weight: 600;
        }
        .custom-sidebar-menu.is-forest .ant-menu-item-selected .anticon {
          color: ${FOREST.brass};
        }
        /* Bootstrap (loaded for the vet pages) paints every plain <a> blue and underlined; inside the
           forest layout, router links take the theme's green instead. */
        .forest-layout {
          --bs-link-color-rgb: 15, 90, 67;
          --bs-link-hover-color-rgb: 11, 63, 47;
        }
        .forest-layout a {
          text-decoration: none;
        }
        /* Page titles in Lora (loaded in index.html, as on the login screen) */
        .forest-layout h1.ant-typography,
        .forest-layout h2.ant-typography,
        .forest-layout h3.ant-typography {
          font-family: 'Lora', Georgia, serif;
        }
        /* Cards sit on the warm page with a soft edge instead of a flat white block */
        .forest-layout .ant-card:not(.ant-card-hoverable),
        .forest-layout .ant-card-hoverable:not(:hover) {
          box-shadow: 0 1px 2px rgba(48, 40, 20, 0.06);
        }
      `}</style>
    </Layout>
  );

  return forest ? <ConfigProvider theme={forestTheme}>{layout}</ConfigProvider> : layout;
}
