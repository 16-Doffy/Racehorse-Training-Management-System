import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, Input, Tag, Switch, Alert, Popconfirm, Space } from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from './usersApi';
import { ROLE_LABELS } from '../../constants/roles';

const { Title } = Typography;

export default function UserManagementPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [roleOverrides, setRoleOverrides] = useState({});
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const allUsers = data?.data || [];
  const pendingUsers = allUsers.filter((u) => u.approvalStatus === 'pending');
  const decidedUsers = allUsers.filter((u) => u.approvalStatus !== 'pending');

  const decideMutation = useMutation({
    mutationFn: ({ id, approve, role }) => usersApi.decideRegistration(id, { approve, role }),
    onSuccess: (_res, variables) => {
      message.success(variables.approve ? 'Đã duyệt tài khoản.' : 'Đã từ chối tài khoản.');
      invalidate();
    },
    onError: (err) => {
      // 409 means someone already decided this registration (another Manager, another tab, or a
      // double-click). Nothing is wrong with the account — the list on screen is just stale, so
      // refresh it instead of showing a failure the Manager can't act on.
      if (err.status === 409) {
        message.info('Tài khoản này đã được xử lý trước đó. Danh sách vừa được làm mới.');
        invalidate();
        return;
      }
      message.error(err.message || 'Thao tác thất bại.');
    },
  });

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

  // Pending registrations get their own table: the Manager's decision here is what actually
  // grants access, so it shouldn't be buried among already-decided accounts.
  const pendingColumns = [
    { title: 'Họ tên', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Điện thoại', dataIndex: 'phone', key: 'phone', render: (v) => v || '—' },
    {
      title: 'Vai trò đăng ký',
      dataIndex: 'role',
      key: 'role',
      render: (r, record) => (
        <Select
          size="small"
          // The applicant picked this themselves, so the Manager can correct it here before
          // approving — nothing is saved until the Duyệt button is pressed.
          value={roleOverrides[record._id] ?? r}
          options={roleOptions}
          style={{ minWidth: 190 }}
          onChange={(newRole) => setRoleOverrides((prev) => ({ ...prev, [record._id]: newRole }))}
        />
      ),
    },
    {
      title: 'Ngày đăng ký',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d) => new Date(d).toLocaleString('vi-VN'),
    },
    {
      title: '',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            loading={decideMutation.isPending}
            onClick={() =>
              decideMutation.mutate({
                id: record._id,
                approve: true,
                role: roleOverrides[record._id] ?? record.role,
              })
            }
          >
            Duyệt
          </Button>
          <Popconfirm
            title="Từ chối tài khoản này?"
            description="Người dùng sẽ không đăng nhập được."
            okText="Từ chối"
            cancelText="Huỷ"
            onConfirm={() => decideMutation.mutate({ id: record._id, approve: false })}
          >
            <Button danger size="small" icon={<CloseOutlined />}>
              Từ chối
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

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
      key: 'isActive',
      render: (_, record) => {
        if (record.approvalStatus === 'rejected') return <Tag color="red">Đã từ chối</Tag>;
        return <Tag color={record.isActive ? 'green' : 'default'}>{record.isActive ? 'Hoạt động' : 'Đã khóa'}</Tag>;
      },
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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <div>
          <Title level={3} className="!mb-0">
            Quản lý Nhân sự &amp; Phân quyền (RBAC)
          </Title>
          <Typography.Text type="secondary" className="text-sm">
            Duyệt tài khoản đăng ký mới, tạo tài khoản trực tiếp, và gán vai trò cho từng nhân sự
            trong câu lạc bộ.
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Tạo tài khoản
        </Button>
      </div>

      {pendingUsers.length > 0 && (
        <Alert
          className="mb-3"
          type="warning"
          showIcon
          title={`${pendingUsers.length} tài khoản đăng ký đang chờ bạn duyệt`}
          description="Người đăng ký tự chọn vai trò — hãy kiểm tra và sửa lại vai trò nếu cần trước khi duyệt. Chỉ sau khi duyệt họ mới đăng nhập được."
        />
      )}

      {pendingUsers.length > 0 && (
        <Table
          className="mb-8"
          rowKey="_id"
          title={() => <span className="font-semibold">Chờ duyệt ({pendingUsers.length})</span>}
          columns={pendingColumns}
          dataSource={pendingUsers}
          loading={isLoading}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      )}

      <Table
        rowKey="_id"
        title={() => <span className="font-semibold">Nhân sự câu lạc bộ ({decidedUsers.length})</span>}
        columns={columns}
        dataSource={decidedUsers}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Chưa có tài khoản nào.' }}
      />

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
