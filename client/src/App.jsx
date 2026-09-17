import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import AppRouter from './router/AppRouter';

export default function App() {
  return (
    <ConfigProvider
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
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </ConfigProvider>
  );
}
