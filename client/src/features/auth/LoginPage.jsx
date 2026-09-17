import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined, TrophyOutlined } from '@ant-design/icons';
import { authApi } from './authApi';
import { credentialsReceived } from './authSlice';
import { ROLE_LABELS } from '../../constants/roles';
import loginBg from '../../assets/login-bg.jpg';

const { Title, Text, Paragraph } = Typography;

const DEMO_ACCOUNTS = [
  { email: 'manager@demo.com', role: 'manager' },
  { email: 'trainer@demo.com', role: 'head_trainer' },
  { email: 'vet@demo.com', role: 'veterinarian' },
  { email: 'groom@demo.com', role: 'groom' },
  { email: 'owner@demo.com', role: 'owner' },
];

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
      setError(err.message || 'Login failed.');
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

        {error && <Alert type="error" message={error} className="mb-4 max-w-sm" showIcon />}

        <Form layout="vertical" onFinish={onFinish} autoComplete="off" className="max-w-sm">
          <Form.Item name="email" label={<span className="text-white/90">Email</span>} rules={[{ required: true, message: 'Vui lòng nhập email' }]}>
            <Input prefix={<UserOutlined className="text-white/70" />} placeholder="you@demo.com" size="large" className="login-glass-input" />
          </Form.Item>
          <Form.Item name="password" label={<span className="text-white/90">Mật khẩu</span>} rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}>
            <Input.Password prefix={<LockOutlined className="text-white/70" />} placeholder="••••••" size="large" className="login-glass-input" />
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

        <div className="text-xs text-white/70 max-w-sm">
          <Text className="!text-white/90" strong>
            Tài khoản demo (mật khẩu: 123456):
          </Text>
          <ul className="mt-1 space-y-0.5">
            {DEMO_ACCOUNTS.map((acc) => (
              <li key={acc.email}>
                {acc.email} — {ROLE_LABELS[acc.role]}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* "Glass" input skin: translucent over the photo instead of Ant Design's default solid
          white field, so the background image reads through the whole form. Done as a scoped
          stylesheet rather than the `style` prop because AntD renders these as
          .ant-input-affix-wrapper (for the prefix icon), and only a stylesheet rule can safely
          override its own !important-free defaults for both the wrapper and its inner <input>
          without the two fighting each other. */}
      <style>{`
        .login-glass-input.ant-input-affix-wrapper {
          background: rgba(255,255,255,0.10);
          border-color: rgba(255,255,255,0.35);
        }
        .login-glass-input.ant-input-affix-wrapper:hover,
        .login-glass-input.ant-input-affix-wrapper-focused {
          background: rgba(255,255,255,0.16);
          border-color: #eab308 !important;
        }
        .login-glass-input .ant-input {
          background: transparent;
          color: #fff;
        }
        .login-glass-input .ant-input::placeholder { color: rgba(255,255,255,0.55); }
      `}</style>
    </div>
  );
}
