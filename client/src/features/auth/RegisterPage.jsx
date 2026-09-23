import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Form, Input, Button, Typography, Alert, Select, Result } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined, TrophyOutlined } from '@ant-design/icons';
import { authApi } from './authApi';
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '../../constants/roles';
import loginBg from '../../assets/login-bg.jpg';

const { Title, Paragraph, Text } = Typography;

const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value,
  label: (
    <div className="py-0.5">
      <div className="font-medium">{label}</div>
      <div className="text-xs text-gray-500">{ROLE_DESCRIPTIONS[value]}</div>
    </div>
  ),
}));

export default function RegisterPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setError('');
    setLoading(true);
    try {
      await authApi.register(values);
      // No token comes back on purpose — the account is inactive until a Club Manager approves
      // it, so there is nothing to log into yet. Show what happens next instead of redirecting
      // into a login that would just fail.
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Đăng ký thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-y-auto overflow-x-hidden flex items-center">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${loginBg})` }} />
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />

      <div className="relative z-10 w-full max-w-xl px-6 md:px-16 py-10 text-white">
        <div className="flex items-center gap-2 mb-5 text-[#eab308]">
          <TrophyOutlined className="text-2xl" />
          <span className="uppercase tracking-[0.25em] text-xs font-semibold">Prestige Athletic Club</span>
        </div>

        {submitted ? (
          <div className="max-w-sm bg-white/95 rounded-xl p-2">
            <Result
              status="success"
              title="Đăng ký thành công!"
              subTitle="Tài khoản của bạn đang chờ Quản lý Câu lạc bộ duyệt. Bạn sẽ đăng nhập được ngay sau khi được duyệt."
              extra={
                <Button type="primary" onClick={() => navigate('/login')} className="!bg-[#022c22]">
                  Về trang đăng nhập
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <Title
              level={2}
              className="!text-white !mb-2 !leading-[1.15] drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              Tạo tài khoản
            </Title>
            <Paragraph className="!text-gray-200 max-w-md mb-6 drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
              Chọn đúng vai trò của bạn trong câu lạc bộ. Tài khoản sẽ được Quản lý Câu lạc bộ duyệt
              trước khi sử dụng được.
            </Paragraph>

            {error && <Alert type="error" title={error} className="mb-4 max-w-sm" showIcon />}

            <Form layout="vertical" onFinish={onFinish} autoComplete="off" className="max-w-sm">
              <Form.Item
                name="name"
                label={<span className="text-white/90">Họ và tên</span>}
                rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
              >
                <Input prefix={<UserOutlined className="text-white/70" />} placeholder="Nguyễn Văn A" size="large" className="auth-glass-input" />
              </Form.Item>
              <Form.Item
                name="email"
                label={<span className="text-white/90">Email</span>}
                rules={[
                  { required: true, message: 'Vui lòng nhập email' },
                  { type: 'email', message: 'Email không hợp lệ' },
                ]}
              >
                <Input prefix={<MailOutlined className="text-white/70" />} placeholder="ban@email.com" size="large" className="auth-glass-input" />
              </Form.Item>
              <Form.Item name="phone" label={<span className="text-white/90">Số điện thoại</span>}>
                <Input prefix={<PhoneOutlined className="text-white/70" />} placeholder="09xxxxxxxx" size="large" className="auth-glass-input" />
              </Form.Item>
              <Form.Item
                name="role"
                label={<span className="text-white/90">Vai trò trong câu lạc bộ</span>}
                rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}
              >
                <Select options={roleOptions} placeholder="Chọn vai trò" size="large" className="auth-glass-input" />
              </Form.Item>
              <Form.Item
                name="password"
                label={<span className="text-white/90">Mật khẩu</span>}
                rules={[
                  { required: true, message: 'Vui lòng nhập mật khẩu' },
                  { min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' },
                ]}
              >
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
                  Đăng ký
                </Button>
              </Form.Item>
            </Form>

            <Text className="!text-white/80 text-sm">
              Đã có tài khoản?{' '}
              <Link to="/login" className="!text-[#eab308] font-semibold hover:!text-yellow-300">
                Đăng nhập
              </Link>
            </Text>
          </>
        )}
      </div>
    </div>
  );
}
