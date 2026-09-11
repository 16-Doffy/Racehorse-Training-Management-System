import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, Input, Tag, message, Switch } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from './usersApi';
import { ROLE_LABELS } from '../../constants/roles';

const { Title } = Typography;

export default function UserManagementPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const createMutation = useMutation({
    mutationFn: (payload) => usersApi.create(payload),
    onSuccess: () => {
      message.success('Đã tạo tài khoản.');
      invalidate();
      setCreateOpen(false);
      createForm.resetFields();
    },
    onError: (err) => message.error(err.message || 'Tạo tài khoản thất bại.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => usersApi.update(id, payload),
    onSuccess: () => {
      message.success('Đã cập nhật tài khoản.');
      invalidate();
      setEditTarget(null);
    },
    onError: (err) => message.error(err.message || 'Cập nhật thất bại.'),
  });

  const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

  const columns = [
    { title: 'Họ tên', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Điện thoại', dataIndex: 'phone', key: 'phone' },
    {
      title: 'Vai trò (RBAC)',
      dataIndex: 'role',
      key: 'role',
      render: (r) => <Tag color="blue">{ROLE_LABELS[r] || r}</Tag>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? 'Hoạt động' : 'Đã khóa'}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      render: (_, record) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setEditTarget(record);
            editForm.setFieldsValue({ name: record.name, phone: record.phone, role: record.role, isActive: record.isActive });
          }}
        >
          Sửa
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Title level={3} className="!mb-0">
          Quản lý Nhân sự &amp; Phân quyền (RBAC)
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Tạo tài khoản
        </Button>
      </div>

      <Table rowKey="_id" columns={columns} dataSource={data?.data} loading={isLoading} />

      <Modal
        title="Tạo tài khoản mới"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item name="name" label="Họ tên" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Điện thoại">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Cập nhật tài khoản — ${editTarget?.name || ''}`}
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) => updateMutation.mutate({ id: editTarget._id, payload: values })}
        >
          <Form.Item name="name" label="Họ tên" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Điện thoại">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Vai trò (RBAC)" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item name="isActive" label="Hoạt động" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="password" label="Đặt lại mật khẩu (để trống nếu không đổi)">
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
