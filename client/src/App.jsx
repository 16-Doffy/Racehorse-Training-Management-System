import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import AppRouter from './router/AppRouter';

export default function App() {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1677ff' } }}>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </ConfigProvider>
  );
}
