import { useState } from 'react';
import { Avatar, Button, Card, Col, Descriptions, Form, Input, Row, Typography, Upload } from 'antd';
import { CameraOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { useMutation } from '@tanstack/react-query';
import { message } from '../../lib/antdStatic';
import { authApi } from './authApi';
import { profileUpdated } from './authSlice';
import { fileHref, uploadFiles } from '../../lib/files';
import { ROLE_LABELS } from '../../constants/roles';

const { Title, Text } = Typography;

/**
 * Every role's own account: name, phone and photo, and their password. Email and role are shown
 * but not editable here — the Club Manager decides those.
 */
export default function ProfilePage() {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [uploading, setUploading] = useState(false);

  const profileMutation = useMutation({
    mutationFn: (payload) => authApi.updateProfile(payload),
    onSuccess: (res) => {
      dispatch(profileUpdated(res.data));
      message.success('Đã cập nhật hồ sơ.');
    },
    onError: (err) => message.error(err.message || 'Cập nhật hồ sơ thất bại.'),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }) => authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      message.success('Đã đổi mật khẩu. Lần đăng nhập sau hãy dùng mật khẩu mới.');
      passwordForm.resetFields();
    },
    onError: (err) => message.error(err.message || 'Đổi mật khẩu thất bại.'),
  });

  // The photo is uploaded first (stored on the server), then its URL saved on the profile.
  const uploadAvatar = async ({ file, onSuccess, onError }) => {
    setUploading(true);
    try {
      const [stored] = await uploadFiles([file], 'avatar');
      await profileMutation.mutateAsync({ avatarUrl: stored.url });
      onSuccess(stored);
    } catch (err) {
      message.error(err.message || 'Tải ảnh lên thất bại.');
      onError(err);
    } finally {
      setUploading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-5xl">
      <Title level={3} className="!mb-1">
        Hồ sơ cá nhân
      </Title>
      <Text type="secondary" className="block mb-4 text-sm">
        Cập nhật thông tin liên hệ, ảnh đại diện và mật khẩu của bạn.
      </Text>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Thông tin">
            <div className="flex items-center gap-4 mb-5">
              <Avatar size={72} src={fileHref(user.avatarUrl)} icon={!user.avatarUrl && <UserOutlined />} />
              <div className="flex flex-col gap-2">
                <Upload accept="image/png,image/jpeg,image/webp" showUploadList={false} customRequest={uploadAvatar}>
                  <Button icon={<CameraOutlined />} loading={uploading}>
                    {user.avatarUrl ? 'Đổi ảnh đại diện' : 'Tải ảnh đại diện'}
                  </Button>
                </Upload>
                {user.avatarUrl && (
                  <Button type="link" size="small" className="!p-0 !h-auto self-start" onClick={() => profileMutation.mutate({ avatarUrl: '' })}>
                    Gỡ ảnh
                  </Button>
                )}
              </div>
            </div>

            <Descriptions column={1} size="small" className="mb-4">
              <Descriptions.Item label="Email">{user.email}</Descriptions.Item>
              <Descriptions.Item label="Vai trò">{ROLE_LABELS[user.role] || user.role}</Descriptions.Item>
            </Descriptions>

            <Form
              form={profileForm}
              layout="vertical"
              initialValues={{ name: user.name, phone: user.phone }}
              onFinish={(values) => profileMutation.mutate(values)}
            >
              <Form.Item name="name" label="Họ tên" rules={[{ required: true, whitespace: true, message: 'Nhập họ tên.' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="phone" label="Số điện thoại">
                <Input placeholder="VD: 0901234567" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={profileMutation.isPending && !uploading}>
                Lưu thông tin
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="Đổi mật khẩu">
            <Form form={passwordForm} layout="vertical" onFinish={(values) => passwordMutation.mutate(values)}>
              <Form.Item name="currentPassword" label="Mật khẩu hiện tại" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại.' }]}>
                <Input.Password prefix={<LockOutlined />} />
              </Form.Item>
              <Form.Item
                name="newPassword"
                label="Mật khẩu mới"
                rules={[
                  { required: true, message: 'Nhập mật khẩu mới.' },
                  { min: 6, message: 'Tối thiểu 6 ký tự.' },
                ]}
              >
                <Input.Password prefix={<LockOutlined />} />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label="Nhập lại mật khẩu mới"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: 'Nhập lại mật khẩu mới.' },
                  ({ getFieldValue }) => ({
                    validator: (_, value) =>
                      !value || value === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Mật khẩu nhập lại không khớp.')),
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={passwordMutation.isPending}>
                Đổi mật khẩu
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
