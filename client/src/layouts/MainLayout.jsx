import { Layout, Menu, Avatar, Dropdown, Typography } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { loggedOut } from '../features/auth/authSlice';
import { siderToggled } from '../store/uiSlice';
import { getMenuByRole } from './menuConfig';
import { ROLE_LABELS } from '../constants/roles';
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
  const selectedKey = menuItems.find((m) => m.path === location.pathname)?.key || menuItems[0]?.key;

  const handleLogout = () => {
    disconnectSocket();
    dispatch(loggedOut());
    navigate('/login', { replace: true });
  };

  return (
    <Layout className="min-h-screen">
      <Sider collapsible collapsed={siderCollapsed} onCollapse={() => dispatch(siderToggled())}>
        <div className="h-16 flex items-center justify-center text-white font-semibold text-lg">
          {siderCollapsed ? 'RTM' : 'Racehorse TMS'}
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
        />
      </Sider>
      <Layout>
        <Header className="!bg-white !px-6 flex items-center justify-between shadow-sm">
          <Text strong>{ROLE_LABELS[user?.role]}</Text>
          <div className="flex items-center gap-5">
            <AlertBell />
            <Dropdown
              menu={{
                items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: handleLogout }],
              }}
            >
              <div className="flex items-center gap-2 cursor-pointer">
                <Avatar icon={<UserOutlined />} />
                <Text>{user?.name}</Text>
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content className="m-4 p-4 bg-white rounded-md min-h-[calc(100vh-112px)]">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
