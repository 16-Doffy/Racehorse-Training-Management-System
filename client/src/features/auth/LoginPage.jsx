import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authApi } from './authApi';
import { credentialsReceived } from './authSlice';
import { ROLE_LABELS } from '../../constants/roles';

const { Title, Text } = Typography;

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
  const location = useLocation();

  const onFinish = async (values) => {
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(values);
      dispatch(credentialsReceived(res.data));
      const redirectTo = location.state?.from || '/';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md shadow-md">
        <Title level={3} className="!mb-1 text-center">
          Racehorse Training &amp; Management
        </Title>
        <Text type="secondary" className="block text-center mb-6">
          Đăng nhập theo vai trò của bạn
        </Text>

        {error && <Alert type="error" message={error} className="mb-4" showIcon />}

        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Vui lòng nhập email' }]}>
            <Input prefix={<UserOutlined />} placeholder="you@demo.com" size="large" />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="••••••" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Đăng nhập
            </Button>
          </Form.Item>
        </Form>

        <div className="mt-4 text-xs text-gray-500">
          <Text strong>Tài khoản demo (mật khẩu: 123456):</Text>
          <ul className="mt-1 space-y-0.5">
            {DEMO_ACCOUNTS.map((acc) => (
              <li key={acc.email}>
                {acc.email} — {ROLE_LABELS[acc.role]}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}
