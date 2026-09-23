import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined, TrophyOutlined } from '@ant-design/icons';
import { authApi } from './authApi';
import { credentialsReceived } from './authSlice';
import loginBg from '../../assets/login-bg.jpg';

const { Title, Paragraph } = Typography;

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(values);
      dispatch(credentialsReceived(res.data));
      // Always land on the dashboard, never on a remembered "from" location: this app is
      // frequently used by switching between different-role demo accounts in the same tab, and
      // honoring a stale "from" (e.g. a role-restricted page the previous account was on) sends
      // the newly-logged-in user straight into a 403 instead of a working screen.
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-y-auto overflow-x-hidden flex items-center">
      {/* Background image on its own layer, kept separate from the text/form so a future filter
          or effect on the photo never touches what's layered on top of it. 1365x768 source —
          sharp enough to cover typical viewports without the upscaling softness the previous
          740x249 photo had. */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${loginBg})` }} />

      {/* Light, mostly-left scrim: just enough for text/inputs to stay legible, while the photo
          itself — not a panel on top of it — stays the visual centerpiece. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />

      <div className="relative z-10 w-full max-w-xl px-6 md:px-16 py-10 text-white">
        <div className="flex items-center gap-2 mb-5 text-[#eab308]">
          <TrophyOutlined className="text-2xl" />
          <span className="uppercase tracking-[0.25em] text-xs font-semibold">Prestige Athletic Club</span>
        </div>
        <Title level={1} className="!text-white !mb-3 !leading-[1.1] drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]" style={{ fontFamily: 'Georgia, serif' }}>
          Racehorse Training &amp;<br />Management System
        </Title>
        <Paragraph className="!text-gray-200 text-base max-w-md mb-8 drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
          Quản lý toàn diện huấn luyện, sức khỏe, chuồng trại và thành tích thi đấu — từ Huấn luyện
          viên trưởng đến Bác sĩ thú y, Nhân viên chăm sóc, Chủ sở hữu và Ban quản lý.
        </Paragraph>

        {error && <Alert type="error" title={error} className="mb-4 max-w-sm" showIcon />}

        <Form layout="vertical" onFinish={onFinish} autoComplete="off" className="max-w-sm">
          <Form.Item name="email" label={<span className="text-white/90">Email</span>} rules={[{ required: true, message: 'Vui lòng nhập email' }]}>
            <Input prefix={<UserOutlined className="text-white/70" />} placeholder="you@demo.com" size="large" className="auth-glass-input" />
          </Form.Item>
          <Form.Item name="password" label={<span className="text-white/90">Mật khẩu</span>} rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}>
            <Input.Password prefix={<LockOutlined className="text-white/70" />} placeholder="••••••" size="large" className="auth-glass-input" />
          </Form.Item>
          <Form.Item className="!mb-4">
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
              className="!bg-[#eab308] hover:!bg-yellow-400 !border-none !text-[#022c22] !font-semibold"
            >
              Đăng nhập
            </Button>
          </Form.Item>
        </Form>

        <div className="text-sm text-white/80 max-w-sm">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="!text-[#eab308] font-semibold hover:!text-yellow-300">
            Đăng ký tại đây
          </Link>
          <div className="text-xs text-white/60 mt-1">
            Tài khoản mới cần được Club Manager duyệt trước khi đăng nhập.
          </div>
        </div>
      </div>
    </div>
  );
}
