import { Layout, Menu, Avatar, Dropdown, Typography, Button } from 'antd';
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

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export default function MainLayout() {
  const { user } = useSelector((state) => state.auth);
  const { siderCollapsed } = useSelector((state) => state.ui);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = getMenuByRole(user?.role);
  const currentPath = location.pathname;

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

  return (
    <Layout style={{ height: '100vh', backgroundColor: '#FAFAFA' }}>
      {/* SIDEBAR */}
      <Sider
        theme="light"
        collapsible
        collapsed={siderCollapsed}
        onCollapse={(value) => dispatch(siderCollapsedSet(value))}
        breakpoint="md"
        width={260}
        className="!bg-white border-r border-gray-200 custom-sider"
        trigger={null}
      >
        {/* Logo Area */}
        <div className="h-16 flex items-center px-6 shrink-0 pt-4">
          <AppstoreFilled className="text-xl mr-2 text-gray-800" />
          {!siderCollapsed && <span className="font-bold text-lg text-gray-900 tracking-tight">Racehorse TMS</span>}
        </div>



        {/* Menu Section */}
        <div className="flex-1 overflow-y-auto px-3 mt-4 custom-sidebar-menu min-h-0">
          {!siderCollapsed && <div className="px-3 text-xs font-semibold text-gray-400 mb-2 uppercase">Dashboards</div>}
          <Menu
            theme="light"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems.map((m) => ({ key: m.key, icon: m.icon, label: <span className="font-medium text-sm">{m.label}</span> }))}
            onClick={({ key }) => {
              const target = menuItems.find((m) => m.key === key);
              if (target) navigate(target.path);
            }}
            className="border-r-0 !bg-white"
          />
        </div>

        {/* Bottom Widgets */}
        {!siderCollapsed && (
          <div className="p-4 shrink-0 mt-auto bg-white border-t border-transparent">
            {/* User Profile */}
            <Dropdown
              menu={{ items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: handleLogout }] }}
              trigger={['click']}
              placement="topRight"
            >
              <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-2 -mx-2 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar className="bg-gray-200 text-gray-600 font-bold" size={36}>
                    {user?.name?.charAt(0)?.toUpperCase()}
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm text-gray-900 leading-tight">{user?.name}</span>
                    <span className="text-xs text-gray-500">{ROLE_LABELS[user?.role]}</span>
                  </div>
                </div>
                <EllipsisOutlined className="text-gray-400 text-lg" />
              </div>
            </Dropdown>
          </div>
        )}
      </Sider>

      {/* MAIN CONTENT AREA */}
      <Layout style={{ backgroundColor: '#FAFAFA' }}>
        <Content
          style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
          className="p-0 md:px-2 pb-6 relative"
        >
          <div className="absolute top-4 right-8 z-50 md:top-4 md:right-10">
            <AlertBell />
          </div>
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
        .custom-sidebar-menu .ant-menu-light {
          background: transparent !important;
        }
        .custom-sidebar-menu .ant-menu-item {
          height: 36px !important;
          line-height: 36px !important;
          border-radius: 8px !important;
          margin-top: 4px !important;
          margin-bottom: 4px !important;
          color: #4b5563 !important; /* gray-600 */
        }
        .custom-sidebar-menu .ant-menu-item:hover {
          background-color: #f3f4f6 !important; /* gray-100 */
          color: #111827 !important; /* gray-900 */
        }
        .custom-sidebar-menu .ant-menu-item-selected {
          background-color: #f3f4f6 !important; /* gray-100 */
          color: #111827 !important; /* gray-900 */
          font-weight: 600 !important;
        }
        /* Hide the blue indicator line in Ant Design */
        .custom-sidebar-menu .ant-menu-item::after {
          display: none !important;
        }
      `}</style>
    </Layout>
  );
}
