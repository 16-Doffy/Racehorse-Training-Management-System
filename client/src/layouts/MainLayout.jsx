import { Layout, Menu, Avatar, Dropdown, Typography } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
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

// Small caption above the role name in the header.
const ROLE_GROUPS = {
  [ROLES.OWNER]: 'Hội đồng Chủ ngựa',
  [ROLES.GROOM]: 'Đội Chăm sóc & Chuồng trại',
  [ROLES.HEAD_TRAINER]: 'Ban Huấn luyện',
  [ROLES.VETERINARIAN]: 'Phòng Thú y',
  [ROLES.MANAGER]: 'Ban Quản lý CLB',
};

export default function MainLayout() {
  const { user } = useSelector((state) => state.auth);
  const { siderCollapsed } = useSelector((state) => state.ui);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = getMenuByRole(user?.role);
  const selectedKey = menuItems.find((m) => m.path === location.pathname)?.key || menuItems[0]?.key;

  const handleLogout = () => {
    disconnectSocket();
    dispatch(loggedOut());
    navigate('/login', { replace: true });
  };

  return (
    // Fixed-height app shell: the outer Layout is exactly one viewport tall and never scrolls
    // itself. Only <Content> scrolls internally. Without this, a page taller than the viewport
    // makes the whole body scroll, and Ant Design's Sider collapse trigger (which is
    // position:fixed to the *window* bottom) visually detaches from the Sider's own background —
    // the "empty gap + floating arrow" bug. Sizing is done with inline styles here because the
    // flex height chain (Layout -> Sider/Layout -> Header/Content) has to be exact, not just a
    // minimum, for the internal-scroll behavior to kick in.
    <Layout style={{ height: '100vh' }}>
      <Sider 
        theme="dark" 
        collapsible 
        collapsed={siderCollapsed} 
        // onCollapse receives the new value for both the trigger click and the responsive
        // breakpoint (auto-collapse on phones, where grooms mostly use the app).
        onCollapse={(value) => dispatch(siderCollapsedSet(value))}
        breakpoint="md"
        className="!bg-[#022c22] border-r border-[#064e3b]"
        style={{ backgroundColor: '#022c22' }}
      >
        <div className="h-16 flex flex-col items-center justify-center border-b border-[#064e3b] px-4">
          <div className="text-[#eab308] font-bold text-lg tracking-wider">
            {siderCollapsed ? 'RTM' : 'Racehorse TMS'}
          </div>
          {!siderCollapsed && <div className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">Prestige Athletic</div>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems.map((m) => ({ key: m.key, icon: m.icon, label: m.label }))}
          onClick={({ key }) => {
            const target = menuItems.find((m) => m.key === key);
            if (target) navigate(target.path);
          }}
          className="!bg-[#022c22] border-r-0 mt-2 prestige-menu"
          style={{ backgroundColor: '#022c22' }}
        />
      </Sider>
      <Layout style={{ height: '100vh', backgroundColor: '#fdfbf7' }}>
        <Header className="!bg-[#fdfbf7] !px-6 flex items-center justify-between shadow-sm shrink-0 border-b border-[#f0f0f0]">
          <div className="flex items-center gap-3 !leading-normal">
            <div className="w-8 h-8 rounded bg-[#022c22] flex items-center justify-center text-[#eab308]">
              <UserOutlined />
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{ROLE_GROUPS[user?.role]}</span>
              <Text strong className="text-[#022c22] text-sm">{ROLE_LABELS[user?.role]}</Text>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <AlertBell />
            <Dropdown
              menu={{
                items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: handleLogout }],
              }}
            >
              <div className="flex items-center gap-2 cursor-pointer hover:bg-white/50 px-2 py-1 rounded transition-colors">
                <Avatar icon={<UserOutlined />} className="bg-[#022c22] text-[#eab308]" />
                <span className="hidden sm:inline">
                  <Text className="font-semibold text-[#022c22]">{user?.name}</Text>
                </span>
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content
          style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
          className="p-4 md:p-6"
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
