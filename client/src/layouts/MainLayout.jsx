import { useEffect, useState } from 'react';
import { ConfigProvider, Layout, Menu, Avatar, Dropdown, Segmented } from 'antd';
import { 
  UserOutlined, 
  LogoutOutlined, 
  AppstoreFilled,
  EllipsisOutlined,
  SunOutlined,
  MoonOutlined,
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
import { FOREST, MENU_SECTION_LABEL, usesForestTheme, usesCanvasPicker, CANVAS_PRESETS, LIGHT_CANVAS, DARK_CANVAS, canvasOf, getForestTheme } from './forestTheme';

const { Sider, Content } = Layout;

/** Brass horseshoe shown as the logo on the forest sidebar for Veterinarian. */
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

/** Royal Team 8 Equestrian Crest: Gold horseshoe, silhouette horse profile, and championship crown */
function Team8LogoCrest() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" fill="none" className="shrink-0" aria-hidden="true">
      {/* Outer Golden Horseshoe */}
      <path d="M7 23C5.5 19.5 5 15 6.5 10.5C8 6 11.5 4 16 4C20.5 4 24 6 25.5 10.5C27 15 26.5 19.5 25 23" stroke="#F2C14E" strokeWidth="2.2" strokeLinecap="round" />
      {/* Inner Golden Horseshoe Rim */}
      <path d="M10.5 22C9.5 19.5 9.2 16 10.2 12.5C11.2 9 13.5 7.5 16 7.5C18.5 7.5 20.8 9 21.8 12.5C22.8 16 22.5 19.5 21.5 22" stroke="#F6D57A" strokeWidth="1.2" strokeLinecap="round" />
      {/* Thoroughbred Horse Silhouette */}
      <path d="M13 18C13 15 14.5 12 17 11C18 10.5 19 11 19 12.5C19 14 18 15 16.5 16C15.5 16.7 15 18 15.5 20" stroke="#FFFDF8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {/* Crown / Star Top Accent */}
      <path d="M16 2L17.2 4.5L20 4.8L18 6.8L18.5 9.5L16 8.2L13.5 9.5L14 6.8L12 4.8L14.8 4.5L16 2Z" fill="#F2C14E" />
      <circle cx="9" cy="18" r="0.9" fill="#F2C14E" />
      <circle cx="23" cy="18" r="0.9" fill="#F2C14E" />
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
  // Club Manager, Head Trainer, Horse Owner and the vet get the forest sidebar and warm page
  // (forestTheme.js). The Manager, the Head Trainer and the Owner choose a canvas; the vet stays on
  // its fixed page.
  const forest = usesForestTheme(user?.role);
  const canvas = usesCanvasPicker(user?.role);
  const [canvasTheme, setCanvasTheme] = useState(() => {
    try {
      return localStorage.getItem('wdp301_canvas_theme') || 'sand_bone';
    } catch {
      return 'sand_bone';
    }
  });
  // A canvas saved in this browser by a Manager must not follow the next person who signs in here.
  const canvasKey = canvas ? canvasOf(canvasTheme) : 'parchment_old';
  const activePreset = CANVAS_PRESETS[canvasKey] || CANVAS_PRESETS.sand_bone;
  const currentTheme = getForestTheme(canvasKey);
  const isDarkCanvas = canvas && canvasKey === DARK_CANVAS;
  // The Manager's and the Head Trainer's pages go fully dark; the Owner's pages keep their light panels.
  const staffDark = isDarkCanvas && [ROLES.MANAGER, ROLES.HEAD_TRAINER].includes(user?.role);

  // Popovers, modals and dropdowns (the alert bell's too, in every role's header) render on <body>, outside
  // the layout: they follow the dark canvas through a body class.
  useEffect(() => {
    document.body.classList.toggle('wdp-dark-portals', isDarkCanvas);
    return () => document.body.classList.remove('wdp-dark-portals');
  }, [isDarkCanvas]);

  let pageBgStyle = { backgroundColor: forest ? activePreset.page : '#FAFAFA' };
  if (canvasKey === 'peak_equestrian_dark') {
    pageBgStyle = { background: 'radial-gradient(circle at 50% 0%, #0E281F 0%, #06130E 65%, #030A07 100%)' };
  }

  const handleSelectCanvas = (key) => {
    setCanvasTheme(key);
    try {
      localStorage.setItem('wdp301_canvas_theme', key);
    } catch {}
  };

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
    <Layout className={forest ? `forest-layout${canvas ? ' is-canvas' : ''}${isDarkCanvas ? ' is-dark-canvas' : ''}${staffDark ? ' staff-dark' : ''}` : undefined} style={{ height: '100vh', ...pageBgStyle }}>
      {/* SIDEBAR */}
      <Sider
        theme={forest ? 'dark' : 'light'}
        collapsible
        collapsed={siderCollapsed}
        onCollapse={(value) => dispatch(siderCollapsedSet(value))}
        breakpoint="md"
        width={260}
        className={forest ? `custom-sider${canvas ? ' canvas-sider' : ''}` : '!bg-white border-r border-gray-200 custom-sider'}
        trigger={null}
      >
        {/* Logo Area: Team 8 WDP301 for Canvas (Manager/Head Trainer); Horseshoe for Veterinarian; Appstore for others */}
        <div className={`h-20 flex items-center px-4 shrink-0 pt-3 ${forest ? 'border-b border-white/10' : 'border-b border-gray-100'}`}>
          {canvas ? (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/25 via-emerald-950/60 to-amber-700/35 border border-amber-400/50 flex items-center justify-center mr-3 shrink-0 shadow-md">
              <Team8LogoCrest />
            </div>
          ) : forest ? (
            <HorseshoeMark />
          ) : (
            <AppstoreFilled className="text-xl mr-2 text-gray-800" />
          )}
          {!siderCollapsed && (
            canvas ? (
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm tracking-wider uppercase text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
                    TEAM 8
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/35">
                    WDP301
                  </span>
                </div>
                <span className="text-[10.5px] font-medium tracking-wider uppercase text-emerald-300/80 truncate">
                  Racehorse TMS
                </span>
              </div>
            ) : (
              <span className={`font-bold text-lg tracking-tight ${forest ? '' : 'text-gray-900'}`} style={forest ? { color: FOREST.logoText } : undefined}>
                Racehorse TMS
              </span>
            )
          )}
        </div>

        {/* Menu Section */}
        <div className={`flex-1 overflow-y-auto mt-4 custom-sidebar-menu ${canvas ? 'px-2 is-canvas-menu is-forest' : forest ? 'px-2 is-forest' : 'px-3 is-light'} min-h-0`}>
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
      <Layout style={{ ...pageBgStyle, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div className="flex justify-between items-center px-4 pt-3 md:px-8 md:pt-4 shrink-0 bg-transparent">
          {canvas ? (
            <Segmented
              size="small"
              aria-label="Giao diện sáng hoặc tối"
              value={isDarkCanvas ? 'dark' : 'light'}
              onChange={(mode) => handleSelectCanvas(mode === 'dark' ? DARK_CANVAS : LIGHT_CANVAS)}
              options={[
                { value: 'light', label: 'Sáng', icon: <SunOutlined /> },
                { value: 'dark', label: 'Tối', icon: <MoonOutlined /> },
              ]}
            />
          ) : <div />}
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

        /* Forest sidebar (Club Manager, Head Trainer): Royal Equestrian look */
        .canvas-sider {
          background: linear-gradient(180deg, #05140E 0%, #081F17 50%, #030D09 100%) !important;
          border-right: 1px solid rgba(212, 175, 55, 0.15) !important;
        }
        /* Forest sidebar for Veterinarian (Classic forest look, no gold border) */
        .custom-sidebar-menu.is-forest:not(.is-canvas-menu) .ant-menu-dark {
          background: transparent !important;
        }
        .custom-sidebar-menu.is-forest:not(.is-canvas-menu) .ant-menu-item {
          height: 38px !important;
          line-height: 38px !important;
          border-radius: 8px !important;
          margin-top: 3px !important;
          margin-bottom: 3px !important;
          padding-inline: 12px !important;
        }
        .custom-sidebar-menu.is-forest:not(.is-canvas-menu) .ant-menu-inline-collapsed .ant-menu-item {
          padding-inline: calc(50% - 8px) !important;
        }
        .custom-sidebar-menu.is-forest:not(.is-canvas-menu) .ant-menu-title-content {
          margin-inline-start: 9px !important;
        }
        .custom-sidebar-menu.is-forest:not(.is-canvas-menu) .ant-menu-title-content span {
          font-size: 13.5px;
        }
        .custom-sidebar-menu.is-forest:not(.is-canvas-menu) .ant-menu-item-selected {
          font-weight: 600;
        }
        .custom-sidebar-menu.is-forest:not(.is-canvas-menu) .ant-menu-item-selected .anticon {
          color: #F2C14E !important;
        }

        /* Royal Equestrian custom menu styling for Manager & Head Trainer (Canvas) */
        .custom-sidebar-menu.is-canvas-menu .ant-menu-dark {
          background: transparent !important;
        }
        .custom-sidebar-menu.is-canvas-menu .ant-menu-item {
          height: 40px !important;
          line-height: 40px !important;
          border-radius: 8px !important;
          margin-top: 4px !important;
          margin-bottom: 4px !important;
          padding-inline: 14px !important;
          border: 1px solid transparent !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .custom-sidebar-menu.is-canvas-menu .ant-menu-item:hover:not(.ant-menu-item-selected) {
          background: rgba(255, 255, 255, 0.05) !important;
          border-color: rgba(212, 175, 55, 0.15) !important;
          color: #FAF8F5 !important;
        }
        .custom-sidebar-menu.is-canvas-menu .ant-menu-inline-collapsed .ant-menu-item {
          padding-inline: calc(50% - 8px) !important;
        }
        .custom-sidebar-menu.is-canvas-menu .ant-menu-title-content {
          margin-inline-start: 10px !important;
        }
        .custom-sidebar-menu.is-canvas-menu .ant-menu-title-content span {
          font-size: 13.5px;
          letter-spacing: -0.01em;
        }
        .custom-sidebar-menu.is-canvas-menu .ant-menu-item-selected {
          background: linear-gradient(90deg, rgba(212, 175, 55, 0.22) 0%, rgba(154, 91, 50, 0.12) 100%) !important;
          border: 1px solid rgba(212, 175, 55, 0.4) !important;
          border-left: 3px solid #D4AF37 !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 8px rgba(0, 0, 0, 0.25) !important;
        }
        .custom-sidebar-menu.is-canvas-menu .ant-menu-item-selected span {
          color: #F8E7B2 !important;
          font-weight: 600 !important;
        }
        .custom-sidebar-menu.is-canvas-menu .ant-menu-item-selected .anticon {
          color: #F2C14E !important;
        }

        /* Luxury Equestrian Card & Table Styling for Light Canvas */
        .forest-layout.is-canvas:not(.is-dark-canvas) .ant-card {
          background-color: #FAF7F0 !important;
          border: 1px solid #E5DEC9 !important;
          border-radius: 14px !important;
          box-shadow: 0 4px 16px -2px rgba(15, 42, 34, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02) !important;
          overflow: hidden !important;
        }
        .forest-layout.is-canvas:not(.is-dark-canvas) .ant-card-head {
          background-color: #F4EFE2 !important;
          border-bottom: 1px solid #E5DEC9 !important;
        }
        .forest-layout.is-canvas:not(.is-dark-canvas) .ant-card-body {
          background-color: #FAF7F0 !important;
        }
        .forest-layout.is-canvas:not(.is-dark-canvas) .ant-table {
          background-color: #FAF7F0 !important;
        }
        .forest-layout.is-canvas:not(.is-dark-canvas) .ant-table-container {
          border: 1px solid #E5DEC9 !important;
          border-radius: 12px !important;
          overflow: hidden !important;
        }
        .forest-layout.is-canvas:not(.is-dark-canvas) .ant-table-thead > tr > th {
          background-color: #F4EFE2 !important;
          color: #123326 !important;
          font-weight: 600 !important;
          border-bottom: 1px solid #E5DEC9 !important;
        }
        .forest-layout.is-canvas:not(.is-dark-canvas) .ant-table-tbody > tr > td {
          border-bottom-color: #EFE9DB !important;
        }
        .forest-layout.is-canvas:not(.is-dark-canvas) .ant-table-tbody > tr:hover > td {
          background-color: #F2EBDC !important;
        }

        /* Luxury Equestrian Card & Table Styling for Dark Canvas (PA 5 Peak Grand Prix) */
        .forest-layout.is-dark-canvas .ant-card {
          background-color: #0D211A !important;
          border: 1px solid rgba(212, 175, 55, 0.25) !important;
          border-radius: 14px !important;
          color: #FAF8F5 !important;
          overflow: hidden !important;
        }
        .forest-layout.is-dark-canvas .ant-card-head {
          background-color: #122B22 !important;
          border-bottom: 1px solid rgba(212, 175, 55, 0.22) !important;
          color: #FAF8F5 !important;
        }
        .forest-layout.is-dark-canvas .ant-card-body {
          background-color: #0D211A !important;
          color: #E2E8F0 !important;
        }
        .forest-layout.is-dark-canvas .ant-table {
          background-color: #0D211A !important;
          color: #FAF8F5 !important;
        }
        .forest-layout.is-dark-canvas .ant-table-container {
          border: 1px solid rgba(212, 175, 55, 0.22) !important;
          border-radius: 12px !important;
          overflow: hidden !important;
        }
        .forest-layout.is-dark-canvas .ant-table-thead > tr > th {
          background-color: #132E24 !important;
          color: #F6D57A !important;
          font-weight: 600 !important;
          border-bottom: 1px solid rgba(212, 175, 55, 0.25) !important;
        }
        .forest-layout.is-dark-canvas .ant-table-tbody > tr > td {
          background-color: #0D211A !important;
          border-bottom-color: rgba(255, 255, 255, 0.06) !important;
          color: #E2E8F0 !important;
        }
        .forest-layout.is-dark-canvas .ant-table-tbody > tr:hover > td {
          background-color: #16362B !important;
        }

        /* High contrast text overrides for Dark Canvas (PA 5 Peak Grand Prix) */
        .forest-layout.is-dark-canvas .ant-card-head .text-gray-900:not([class*="bg-"]),
        .forest-layout.is-dark-canvas .ant-card-head .ant-card-head-title,
        .forest-layout.is-dark-canvas .ant-card-head h1,
        .forest-layout.is-dark-canvas .ant-card-head h2,
        .forest-layout.is-dark-canvas .ant-card-head h3,
        .forest-layout.is-dark-canvas .ant-card-head h4 {
          color: #FAF8F5 !important;
        }
        .forest-layout.is-dark-canvas .ant-card-head .text-gray-500,
        .forest-layout.is-dark-canvas .ant-card-head .text-gray-400,
        .forest-layout.is-dark-canvas .ant-card-head .ant-typography-secondary {
          color: rgba(250, 248, 245, 0.7) !important;
        }
        .forest-layout.is-dark-canvas .ant-card-body .text-gray-900:not(.light-surface-box *):not(.light-surface-box),
        .forest-layout.is-dark-canvas .ant-card-body span.text-gray-900:not(.light-surface-box *):not(.light-surface-box),
        .forest-layout.is-dark-canvas .ant-card-body strong:not(.light-surface-box *):not(.light-surface-box) {
          color: #FAF8F5 !important;
        }
        .forest-layout.is-dark-canvas .ant-card-body .text-gray-600:not(.light-surface-box *):not(.light-surface-box),
        .forest-layout.is-dark-canvas .ant-card-body .text-gray-500:not(.light-surface-box *):not(.light-surface-box),
        .forest-layout.is-dark-canvas .ant-card-body .text-gray-400:not(.light-surface-box *):not(.light-surface-box),
        .forest-layout.is-dark-canvas .ant-card-body .ant-typography-secondary:not(.light-surface-box *):not(.light-surface-box) {
          color: rgba(250, 248, 245, 0.75) !important;
        }
        /* Golden links across dark canvas, excluding light surface boxes */
        .forest-layout.is-dark-canvas a:not(.ant-btn):not(.light-surface-box *):not(.light-surface-box) {
          color: #F6D57A !important;
        }
        .forest-layout.is-dark-canvas a:not(.ant-btn):not(.light-surface-box *):not(.light-surface-box):hover {
          color: #F8E7B2 !important;
        }
        .forest-layout.is-dark-canvas .ant-table-cell a:not(.light-surface-box *) {
          color: #F6D57A !important;
        }
        .forest-layout.is-dark-canvas .ant-table-cell a:not(.light-surface-box *):hover {
          color: #F8E7B2 !important;
        }
        .forest-layout.is-dark-canvas .ant-empty-description {
          color: rgba(250, 248, 245, 0.7) !important;
        }
        .forest-layout.is-dark-canvas .ant-table-cell {
          color: #E2E8F0 !important;
        }
        .forest-layout.is-dark-canvas .ant-table-cell .ant-typography {
          color: #FAF8F5 !important;
        }

        /* Primary button in dark canvas: crisp dark equestrian text on gold button background */
        .forest-layout.is-dark-canvas .ant-btn-primary:not(.ant-btn-dangerous) {
          color: #0D211A !important;
          background-color: #D4AF37 !important;
          border-color: #D4AF37 !important;
          font-weight: 600 !important;
        }
        .forest-layout.is-dark-canvas .ant-btn-primary:not(.ant-btn-dangerous):hover {
          color: #05140E !important;
          background-color: #E2C058 !important;
          border-color: #E2C058 !important;
        }
        .forest-layout.is-dark-canvas .ant-btn-primary:not(.ant-btn-dangerous) > span {
          color: #0D211A !important;
        }

        /* Dangerous (red) buttons in dark canvas: soft rose with high contrast */
        .forest-layout.is-dark-canvas .ant-btn-dangerous,
        .forest-layout.is-dark-canvas .ant-btn-dangerous span {
          color: #FDA4AF !important;
          border-color: rgba(244, 63, 94, 0.4) !important;
        }

        /* Select placeholders & metadata text in dark canvas */
        .forest-layout.is-dark-canvas .ant-select-placeholder,
        .forest-layout.is-dark-canvas .ant-select-selection-placeholder {
          color: #94A3B8 !important;
        }
        .forest-layout.is-dark-canvas .ant-input::placeholder {
          color: #94A3B8 !important;
        }
        .forest-layout.is-dark-canvas .text-gray-500:not(.light-surface-box *):not(.light-surface-box),
        .forest-layout.is-dark-canvas .text-gray-400:not(.light-surface-box *):not(.light-surface-box),
        .forest-layout.is-dark-canvas .ant-typography-secondary:not(.light-surface-box *):not(.light-surface-box) {
          color: #C3D4CA !important;
        }
        .forest-layout.is-dark-canvas .text-gray-600:not(.light-surface-box *):not(.light-surface-box) {
          color: #D1D5DB !important;
        }
        .forest-layout.is-dark-canvas .text-slate-600:not(.light-surface-box *):not(.light-surface-box) {
          color: #A1B5AB !important;
        }
        .forest-layout.is-dark-canvas .guardrail-title {
          color: #34D399 !important;
        }
        .forest-layout.is-dark-canvas .guardrail-dot {
          background-color: #34D399 !important;
        }
        .forest-layout.is-dark-canvas .text-2xl.font-semibold {
          color: #FAF8F5 !important;
        }

        /* Surface protection: crisp dark text inside designated light surface callouts */
        .forest-layout.is-dark-canvas .light-surface-box {
          background-color: #FAF6EE !important;
          border-color: #E2D7C3 !important;
          color: #0F172A !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box a:not(.ant-btn) {
          color: #0F5A43 !important;
          text-decoration: underline !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box a:not(.ant-btn):hover {
          color: #0B4634 !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .ant-btn {
          color: #451A03 !important;
          background-color: #FFFFFF !important;
          border-color: #FCD34D !important;
          font-weight: 600 !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .text-gray-900,
        .forest-layout.is-dark-canvas .light-surface-box .text-gray-800,
        .forest-layout.is-dark-canvas .light-surface-box .text-gray-700,
        .forest-layout.is-dark-canvas .light-surface-box strong,
        .forest-layout.is-dark-canvas .light-surface-box th {
          color: #0F172A !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .text-gray-600,
        .forest-layout.is-dark-canvas .light-surface-box .text-slate-600 {
          color: #334155 !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .text-gray-500,
        .forest-layout.is-dark-canvas .light-surface-box .text-slate-500,
        .forest-layout.is-dark-canvas .light-surface-box .ant-typography-secondary {
          color: #475569 !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box td {
          color: #1E293B !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .text-emerald-950,
        .forest-layout.is-dark-canvas .light-surface-box .text-emerald-900 {
          color: #022C22 !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .text-slate-900,
        .forest-layout.is-dark-canvas .light-surface-box .text-slate-800 {
          color: #0F172A !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .text-amber-950,
        .forest-layout.is-dark-canvas .light-surface-box .text-amber-900 {
          color: #451A03 !important;
        }
        /* Bootstrap (loaded for the vet pages) paints every plain <a> blue and underlined; inside the
           forest layout, router links take the theme's green instead. */
        .forest-layout {
          --bs-link-color-rgb: 15, 90, 67;
          --bs-link-hover-color-rgb: 11, 63, 47;
          --bs-primary: #0F5A43;
          --bs-primary-rgb: 15, 90, 67;
        }
        .forest-layout a {
          text-decoration: none;
        }
        .forest-layout .btn-primary {
          background-color: #0F5A43 !important;
          border-color: #0F5A43 !important;
        }
        .forest-layout .btn-primary:hover,
        .forest-layout .btn-primary:focus,
        .forest-layout .btn-primary:active {
          background-color: #0B4634 !important;
          border-color: #0B4634 !important;
        }
        .forest-layout .btn-outline-primary {
          color: #0F5A43 !important;
          border-color: #0F5A43 !important;
        }
        .forest-layout .btn-outline-primary:hover,
        .forest-layout .btn-outline-primary:focus,
        .forest-layout .btn-outline-primary:active {
          background-color: #0F5A43 !important;
          border-color: #0F5A43 !important;
          color: #ffffff !important;
        }
        .forest-layout .text-primary {
          color: #0F5A43 !important;
        }
        .forest-layout .bg-primary {
          background-color: #0F5A43 !important;
        }
        .forest-layout .border-primary {
          border-color: #0F5A43 !important;
        }
        .forest-layout .bg-primary-subtle {
          background-color: #E7F2EA !important;
          color: #0F5A43 !important;
        }
        .forest-layout .border-primary-subtle {
          border-color: #BCD9C6 !important;
        }
        .forest-layout .badge.bg-primary {
          background-color: #0F5A43 !important;
        }
        .forest-layout .badge.bg-primary-subtle {
          background-color: #E7F2EA !important;
          color: #0F5A43 !important;
          border-color: #BCD9C6 !important;
        }
        .forest-layout .card {
          border-color: #E4DFD3 !important;
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

        /* A page built from light boxes (the Owner's pages) keeps its antd cards and tables light on a dark
           canvas too; otherwise they turn dark while the text inside stays dark. */
        .forest-layout.is-dark-canvas .light-surface-box .ant-card,
        .forest-layout.is-dark-canvas .light-surface-box .ant-card-body,
        .forest-layout.is-dark-canvas .light-surface-box .ant-table,
        .forest-layout.is-dark-canvas .light-surface-box .ant-table-tbody > tr > td {
          background-color: #FFFFFF !important;
          color: #1F2937 !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .ant-card,
        .forest-layout.is-dark-canvas .light-surface-box .ant-table-container {
          border-color: #E5DEC9 !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .ant-card-head,
        .forest-layout.is-dark-canvas .light-surface-box .ant-table-thead > tr > th {
          background-color: #F4EFE2 !important;
          color: #123326 !important;
          border-color: #E5DEC9 !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .ant-table-tbody > tr > td {
          border-bottom-color: #EFE9DB !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .ant-table-tbody > tr:hover > td {
          background-color: #F7F3EA !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .ant-table-cell a:not(.ant-btn) {
          color: #0F5A43 !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .ant-pagination-item,
        .forest-layout.is-dark-canvas .light-surface-box .ant-pagination-item-link {
          background-color: #FFFFFF !important;
          border-color: #E5DEC9 !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .ant-pagination-item a {
          color: #0F5A43 !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .ant-statistic-title {
          color: #6B7280 !important;
        }
        .forest-layout.is-dark-canvas .light-surface-box .ant-empty-description {
          color: #6B7280 !important;
        }

        /* Horse Owner pages (.owner-ui): compact tables. Only spacing and type; colours stay with the rules above. */
        .forest-layout .owner-ui .ant-table-thead > tr > th {
          padding: 9px 14px !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
        .forest-layout .owner-ui .ant-table-thead > tr > th::before {
          display: none !important;
        }
        .forest-layout .owner-ui .ant-table-tbody > tr:not(.ant-table-measure-row) > td {
          padding: 10px 14px !important;
          font-size: 13.5px;
        }
        .forest-layout .owner-ui .ant-table-tbody > tr:not(.ant-table-measure-row):last-child > td {
          border-bottom: 0 !important;
        }
        /* On a dark canvas the light page panel gets a little inner margin, so bare text (the horse picker, the counts) is not on its edge. */
        .forest-layout.is-dark-canvas .light-surface-box.owner-ui {
          padding: 0 8px 8px;
        }
        .forest-layout .owner-ui .ant-pagination {
          margin: 10px 16px !important;
        }
        .forest-layout .owner-ui .ant-btn {
          border-radius: 8px;
        }
        .forest-layout .owner-ui .ant-segmented {
          border-radius: 8px;
        }

        /* Manager / Head Trainer on the dark canvas: the boxes that stay light on the light canvas (KPI
           strips, ribbons, the week calendar, empty states) go dark as well, with cream text, so the page
           has no white blocks. The Owner's pages keep their own light panels (rules above). These win over
           the light-box rules by one more class. */
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box {
          background-color: #10261E !important;
          background-image: none !important;
          border-color: rgba(212, 175, 55, 0.22) !important;
          color: #E6EDE8 !important;
        }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box strong, .forest-layout.is-dark-canvas.staff-dark .light-surface-box th, .forest-layout.is-dark-canvas.staff-dark .light-surface-box td { color: #F4F1E8 !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box a:not(.ant-btn) { color: #F6D57A !important; text-decoration: none !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box a:not(.ant-btn):hover { color: #F8E7B2 !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box .ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous) {
          color: #FCD34D !important;
          background-color: rgba(255, 255, 255, 0.06) !important;
          border-color: rgba(252, 211, 77, 0.4) !important;
        }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box .ant-card, .forest-layout.is-dark-canvas.staff-dark .light-surface-box .ant-card-body, .forest-layout.is-dark-canvas.staff-dark .light-surface-box .ant-table, .forest-layout.is-dark-canvas.staff-dark .light-surface-box .ant-table-tbody > tr > td {
          background-color: transparent !important;
          color: #E6EDE8 !important;
        }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box .ant-card-head, .forest-layout.is-dark-canvas.staff-dark .light-surface-box .ant-table-thead > tr > th {
          background-color: rgba(255, 255, 255, 0.05) !important;
          color: #F4F1E8 !important;
          border-color: rgba(212, 175, 55, 0.18) !important;
        }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box .ant-table-tbody > tr:hover > td { background-color: rgba(255, 255, 255, 0.05) !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box .ant-statistic-title, .forest-layout.is-dark-canvas.staff-dark .light-surface-box .ant-empty-description, .forest-layout.is-dark-canvas.staff-dark .light-surface-box .ant-typography-secondary { color: #B9CABF !important; }

        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="text-gray-900"], [class~="text-gray-800"], [class~="text-gray-700"], [class~="text-slate-900"], [class~="text-slate-800"], [class~="text-slate-700"], [class~="text-[#0F5A43]"]) { color: #F4F1E8 !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="text-gray-600"], [class~="text-gray-500"], [class~="text-slate-600"], [class~="text-slate-500"]) { color: #B9CABF !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="text-gray-400"], [class~="text-gray-300"], [class~="text-slate-400"]) { color: #93AB9E !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="text-emerald-600"], [class~="text-emerald-700"], [class~="text-emerald-800"], [class~="text-emerald-900"], [class~="text-emerald-950"], [class~="text-green-600"], [class~="text-green-700"]) { color: #6EE7B7 !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="text-orange-600"], [class~="text-orange-700"], [class~="text-amber-600"], [class~="text-amber-700"], [class~="text-amber-800"], [class~="text-amber-900"], [class~="text-amber-950"]) { color: #FCD34D !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="text-rose-600"], [class~="text-rose-700"], [class~="text-rose-800"], [class~="text-rose-900"], [class~="text-red-600"], [class~="text-red-700"]) { color: #FDA4AF !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="text-blue-600"], [class~="text-blue-700"], [class~="text-blue-800"], [class~="text-sky-700"], [class~="text-cyan-600"], [class~="text-cyan-700"]) { color: #93C5FD !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="bg-white"], [class~="!bg-white"], [class~="bg-gray-100"], [class~="bg-slate-100"], [class~="bg-gray-50"], [class~="bg-gray-50/80"], [class~="bg-slate-50"], [class~="bg-slate-50/80"], [class~="bg-[#FFFDF8]"], [class~="bg-[#FAF7F0]"], [class~="bg-[#F2ECE0]"], [class~="bg-[#EAE1D2]"]) { background-color: rgba(255, 255, 255, 0.05) !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="bg-emerald-100"], [class~="bg-emerald-50"], [class~="bg-emerald-50/20"], [class~="bg-emerald-50/60"], [class~="bg-green-50"]) { background-color: rgba(16, 185, 129, 0.14) !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="bg-orange-50"], [class~="bg-orange-100"], [class~="bg-yellow-50"], [class~="bg-amber-50"], [class~="bg-amber-50/30"], [class~="bg-amber-50/50"], [class~="bg-amber-50/60"], [class~="bg-amber-100"], [class~="bg-amber-100/90"]) { background-color: rgba(245, 158, 11, 0.14) !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="bg-rose-50"], [class~="bg-rose-100"], [class~="bg-red-50"], [class~="bg-red-100"]) { background-color: rgba(244, 63, 94, 0.14) !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="bg-blue-50"], [class~="bg-blue-50/60"], [class~="bg-blue-100"], [class~="bg-cyan-50"], [class~="bg-sky-50"]) { background-color: rgba(59, 130, 246, 0.16) !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="border-gray-100"], [class~="border-gray-200"], [class~="border-gray-200/80"], [class~="border-[#E4DFD3]"], [class~="border-[#E5DEC9]"], [class~="border-[#EFE8DA]"], [class~="border-slate-200"], [class~="border-slate-200/70"], [class~="border-amber-200/50"], [class~="border-emerald-200/60"], [class~="divide-[#EFE8DA]"], [class~="divide-gray-100"]) { border-color: rgba(212, 175, 55, 0.18) !important; }
        .forest-layout.is-dark-canvas.staff-dark .light-surface-box :is([class~="hover:bg-rose-50/40"], [class~="hover:bg-gray-50/40"], [class~="hover:bg-emerald-50/50"], [class~="hover:bg-amber-50/50"], [class~="hover:!bg-amber-50"], [class~="hover:bg-gray-50"]):hover { background-color: rgba(255, 255, 255, 0.07) !important; }
        /* Item codes (<code>, inventory): Bootstrap's pink is too faint on the warm cards and on the dark ones. */
        .forest-layout.is-canvas code { color: #0F5A43 !important; }
        .forest-layout.is-dark-canvas.staff-dark code { color: #F6D57A !important; background-color: rgba(255, 255, 255, 0.06) !important; }
        /* Chart legends on the dark canvas: the label reads in cream, the marker keeps the series colour. */
        .forest-layout.is-dark-canvas.staff-dark .recharts-legend-item-text { color: #E6EDE8 !important; }
        /* Headings on the dark canvas: warm champagne rather than plain white, to sit with the brass accents. */
        .forest-layout.is-dark-canvas.staff-dark .ant-card-head-title,
        .forest-layout.is-dark-canvas.staff-dark h1.ant-typography,
        .forest-layout.is-dark-canvas.staff-dark h2.ant-typography,
        .forest-layout.is-dark-canvas.staff-dark h3.ant-typography,
        .forest-layout.is-dark-canvas.staff-dark h4.ant-typography {
          color: #F3E3BC !important;
        }

        /* Popups render outside the layout (body), so the dark canvas reaches them through a body class:
           text written for a light popup turns light on the dark popup. */
        body.wdp-dark-portals .ant-popover .ant-popover-inner,
        body.wdp-dark-portals .ant-popover .ant-popover-arrow::before {
          border: 1px solid rgba(212, 175, 55, 0.25);
        }

        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="text-gray-900"], [class~="text-gray-800"], [class~="text-gray-700"], [class~="text-slate-900"], [class~="text-slate-800"], [class~="text-slate-700"], [class~="text-[#0F5A43]"]) { color: #F4F1E8 !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="text-gray-600"], [class~="text-gray-500"], [class~="text-slate-600"], [class~="text-slate-500"]) { color: #B9CABF !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="text-gray-400"], [class~="text-gray-300"], [class~="text-slate-400"]) { color: #93AB9E !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="text-emerald-600"], [class~="text-emerald-700"], [class~="text-emerald-800"], [class~="text-emerald-900"], [class~="text-emerald-950"], [class~="text-green-600"], [class~="text-green-700"]) { color: #6EE7B7 !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="text-orange-600"], [class~="text-orange-700"], [class~="text-amber-600"], [class~="text-amber-700"], [class~="text-amber-800"], [class~="text-amber-900"], [class~="text-amber-950"]) { color: #FCD34D !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="text-rose-600"], [class~="text-rose-700"], [class~="text-rose-800"], [class~="text-rose-900"], [class~="text-red-600"], [class~="text-red-700"]) { color: #FDA4AF !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="text-blue-600"], [class~="text-blue-700"], [class~="text-blue-800"], [class~="text-sky-700"], [class~="text-cyan-600"], [class~="text-cyan-700"]) { color: #93C5FD !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="bg-white"], [class~="!bg-white"], [class~="bg-gray-100"], [class~="bg-slate-100"], [class~="bg-gray-50"], [class~="bg-gray-50/80"], [class~="bg-slate-50"], [class~="bg-slate-50/80"], [class~="bg-[#FFFDF8]"], [class~="bg-[#FAF7F0]"], [class~="bg-[#F2ECE0]"], [class~="bg-[#EAE1D2]"]) { background-color: #12291F !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="bg-emerald-100"], [class~="bg-emerald-50"], [class~="bg-emerald-50/20"], [class~="bg-emerald-50/60"], [class~="bg-green-50"]) { background-color: rgba(16, 185, 129, 0.14) !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="bg-orange-50"], [class~="bg-orange-100"], [class~="bg-yellow-50"], [class~="bg-amber-50"], [class~="bg-amber-50/30"], [class~="bg-amber-50/50"], [class~="bg-amber-50/60"], [class~="bg-amber-100"], [class~="bg-amber-100/90"]) { background-color: rgba(245, 158, 11, 0.14) !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="bg-rose-50"], [class~="bg-rose-100"], [class~="bg-red-50"], [class~="bg-red-100"]) { background-color: rgba(244, 63, 94, 0.14) !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="bg-blue-50"], [class~="bg-blue-50/60"], [class~="bg-blue-100"], [class~="bg-cyan-50"], [class~="bg-sky-50"]) { background-color: rgba(59, 130, 246, 0.16) !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="border-gray-100"], [class~="border-gray-200"], [class~="border-gray-200/80"], [class~="border-[#E4DFD3]"], [class~="border-[#E5DEC9]"], [class~="border-[#EFE8DA]"], [class~="border-slate-200"], [class~="border-slate-200/70"], [class~="border-amber-200/50"], [class~="border-emerald-200/60"], [class~="divide-[#EFE8DA]"], [class~="divide-gray-100"]) { border-color: rgba(212, 175, 55, 0.18) !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) :is([class~="hover:bg-rose-50/40"], [class~="hover:bg-gray-50/40"], [class~="hover:bg-emerald-50/50"], [class~="hover:bg-amber-50/50"], [class~="hover:!bg-amber-50"], [class~="hover:bg-gray-50"]):hover { background-color: #1A3A2E !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) strong { color: #F4F1E8 !important; }
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) .ant-btn-dangerous:not(.ant-btn-primary),
        body.wdp-dark-portals :is(.ant-popover, .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown) .ant-btn-dangerous:not(.ant-btn-primary) span {
          color: #FDA4AF !important;
          border-color: rgba(244, 63, 94, 0.45) !important;
        }
      `}</style>
    </Layout>
  );

  return forest ? <ConfigProvider theme={currentTheme}>{layout}</ConfigProvider> : layout;
}
