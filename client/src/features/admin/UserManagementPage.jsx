import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, Input, Tag, Switch, Popconfirm, Space } from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { usersApi } from './usersApi';
import { ROLE_LABELS } from '../../constants/roles';
import PageHeroBanner from '../../components/common/PageHeroBanner';


export default function UserManagementPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [roleOverrides, setRoleOverrides] = useState({});
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const queryClient = useQueryClient();
  const currentUserId = useSelector((state) => state.auth.user?._id);
  const editingSelf = editTarget && String(editTarget._id) === String(currentUserId);

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
    onSuccess: (res) => {
      if (res?.data?.uncoveredHorses?.length) message.warning(res.message, 8);
      else message.success('Đã cập nhật tài khoản.');
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

  const activeCount = decidedUsers.filter((u) => u.isActive !== false).length;
  const lockedCount = decidedUsers.filter((u) => u.isActive === false).length;
  const pendingCount = pendingUsers.length;
  const totalCount = allUsers.length;

  return (
    <div>
      <PageHeroBanner
        eyebrow="TEAM 8 • BAN ĐIỀU HÀNH & NHÂN SỰ"
        roleLabel="Club Manager"
        title="Quản Lý Nhân Sự & Phân Quyền (RBAC)"
        subtitle="Duyệt tài khoản đăng ký mới, tạo tài khoản trực tiếp và phân quyền vai trò cho từng thành viên câu lạc bộ."
        stats={[
          { label: 'Tổng nhân sự', value: `${totalCount} người` },
          { label: 'Đang hoạt động', value: `${activeCount} người` },
          { label: 'Chờ duyệt', value: `${pendingCount} tài khoản` },
          { label: 'Vô hiệu hóa', value: `${lockedCount} tài khoản` },
        ]}
        actionButton={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
            className="!h-10 !px-4 !rounded-xl !bg-gradient-to-r !from-amber-600 !to-amber-700 hover:!from-amber-500 hover:!to-amber-600 !border-amber-400/40 !text-white font-semibold cursor-pointer shadow-md"
          >
            Tạo tài khoản mới
          </Button>
        }
      />

      {/* KPI Ribbon - Mẫu 1 Prestige British Racing */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5 p-3 rounded-xl bg-white border border-[#E4DFD3] shadow-xs">
        <div className="px-3 py-1.5 border-r border-[#E4DFD3] last:border-r-0">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tổng Nhân Sự</div>
          <div className="text-xl font-bold text-[#0F5A43] tabular-nums mt-0.5">{totalCount} <span className="text-xs font-normal text-slate-500">tài khoản</span></div>
        </div>
        <div className="px-3 py-1.5 border-r border-[#E4DFD3] last:border-r-0">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Đang Hoạt Động</div>
          <div className="text-xl font-bold text-slate-800 tabular-nums mt-0.5">{activeCount} <span className="text-xs font-normal text-slate-500">người</span></div>
        </div>
        <div className="px-3 py-1.5 border-r border-[#E4DFD3] last:border-r-0">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Chờ Duyệt Đăng Ký</div>
          <div className={`text-xl font-bold tabular-nums mt-0.5 ${pendingCount > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
            {pendingCount} <span className="text-xs font-normal text-slate-500">tài khoản</span>
          </div>
        </div>
        <div className="px-3 py-1.5">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Đã Vô Hiệu Hóa</div>
          <div className={`text-xl font-bold tabular-nums mt-0.5 ${lockedCount > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
            {lockedCount} <span className="text-xs font-normal text-slate-500">tài khoản</span>
          </div>
        </div>
      </div>

      {pendingUsers.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200/80 bg-amber-50/30 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-amber-900 flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Tài khoản đăng ký chờ bạn duyệt ({pendingUsers.length})
            </span>
            <Typography.Text type="secondary" className="!text-xs">
              Kiểm tra vai trò trước khi duyệt
            </Typography.Text>
          </div>
          <Table
            rowKey="_id"
            columns={pendingColumns}
            dataSource={pendingUsers}
            loading={isLoading}
            pagination={false}
            scroll={{ x: 'max-content' }}
            size="small"
          />
        </div>
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
          {/* The server refuses a Manager demoting or disabling their own account; the controls
              say so up front instead of failing on save. */}
          <Form.Item
            name="role"
            label="Vai trò (RBAC)"
            rules={[{ required: true }]}
            extra={editingSelf ? 'Không thể tự đổi vai trò của chính mình.' : null}
          >
            <Select options={roleOptions} disabled={editingSelf} />
          </Form.Item>
          <Form.Item
            name="isActive"
            label="Hoạt động"
            valuePropName="checked"
            extra={editingSelf ? 'Không thể tự khóa tài khoản của chính mình.' : 'Tắt sẽ khóa đăng nhập; các ngựa người này phụ trách sẽ cần người thay.'}
          >
            <Switch disabled={editingSelf} />
          </Form.Item>
          <Form.Item
            name="password"
            label="Đặt lại mật khẩu (để trống nếu không đổi)"
            rules={[{ min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
