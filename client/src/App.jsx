import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import viVN from 'antd/locale/vi_VN';
import AppRouter from './router/AppRouter';
import { StaticAntdApi } from './lib/antdStatic';

export default function App() {
  return (
    <ConfigProvider
      // Vietnamese locale so Ant Design's own strings (date pickers, "No data", pagination,
      // table filters) match the rest of the UI instead of falling back to English.
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#022c22', // Forest Green for Prestige look
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          borderRadius: 8,
          colorBgContainer: '#ffffff',
          colorBorderSecondary: '#f0f0f0',
        },
      }}
    >
      {/* AntD's App provides the context-aware message/notification/modal instances. Without it,
          the static `message.success(...)` calls warn that they can't read the theme above. */}
      <AntdApp>
        <StaticAntdApi />
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}
