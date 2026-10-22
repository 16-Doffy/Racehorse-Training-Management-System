import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, Input, Tag, Switch, Popconfirm, Space, Alert } from 'antd';
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
  // Sign-ups being decided right now, by id ('approve' | 'reject'): each row stays busy until its own
  // answer comes back, however many the Manager clicks in a row.
  const [deciding, setDeciding] = useState({});
  // A groom being locked (or moved to another role) who still holds stalls, horses or work: the
  // server asks for a replacement, and the save is sent again with the one picked here.
  const [handover, setHandover] = useState(null);
  const [replacement, setReplacement] = useState();
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const queryClient = useQueryClient();
  const currentUserId = useSelector((state) => state.auth.user?._id);
  const editingSelf = editTarget && String(editTarget._id) === String(currentUserId);

  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const allUsers = data?.data || [];
  const pendingUsers = allUsers.filter((u) => u.approvalStatus === 'pending');
  const decidedUsers = allUsers.filter((u) => u.approvalStatus !== 'pending');

  const decideMutation = useMutation({
    mutationFn: ({ id, approve, role }) => usersApi.decideRegistration(id, { approve, role }),
    onMutate: ({ id, approve }) => setDeciding((now) => ({ ...now, [id]: approve ? 'approve' : 'reject' })),
    onSettled: (_res, _err, { id }) =>
      setDeciding((now) => {
        const next = { ...now };
        delete next[id];
        return next;
      }),
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
      else if (res?.data?.handedOver) message.success(res.message, 6);
      else message.success('Đã cập nhật tài khoản.');
      invalidate();
      setEditTarget(null);
      setHandover(null);
      setReplacement(undefined);
    },
    onError: (err, variables) => {
      if (err.status === 409 && err.data?.needsReplacement) {
        setHandover({ ...variables, ...err.data });
        return;
      }
      message.error(err.message || 'Cập nhật thất bại.');
    },
  });
  // Who can take over from the groom being locked: the other active grooms.
  const replacementOptions = allUsers
    .filter((u) => u.role === 'groom' && u.isActive !== false && u.approvalStatus !== 'pending' && String(u._id) !== String(handover?.id))
    .map((u) => ({ value: u._id, label: u.name }));

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
      render: (_, record) => {
        const busy = deciding[record._id];
        return (
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              loading={busy === 'approve'}
              disabled={Boolean(busy)}
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
              <Button
                danger
                size="small"
                icon={<CloseOutlined />}
                loading={busy === 'reject'}
                disabled={Boolean(busy)}
              >
                Từ chối
              </Button>
            </Popconfirm>
          </Space>
        );
      },
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
        eyebrow="Quản trị nhân sự"
        roleLabel="Quản lý CLB"
        title="Nhân sự & phân quyền"
        subtitle="Duyệt tài khoản đăng ký mới, tạo tài khoản trực tiếp và phân quyền vai trò cho thành viên câu lạc bộ."
        actionButton={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
            className="!h-9 !px-4 !rounded-lg !bg-[#D4AF37] hover:!bg-[#E2C058] !border-[#D4AF37] !text-[#061812] font-semibold cursor-pointer"
          >
            Tạo tài khoản mới
          </Button>
        }
      />

      <div className="light-surface-box grid grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E4DFD3] mb-5 rounded-xl bg-[#FAF7F0] border border-[#E5DEC9] shadow-xs overflow-hidden">
        <div className="p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-600">Tổng nhân sự</div>
          <div className="text-xl sm:text-2xl font-bold text-[#0F5A43] tabular-nums mt-1">{totalCount} <span className="text-xs font-normal text-slate-500">tài khoản</span></div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-600">Đang hoạt động</div>
          <div className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums mt-1">{activeCount} <span className="text-xs font-normal text-slate-500">người</span></div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-600">Chờ duyệt đăng ký</div>
          <div className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${pendingCount > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
            {pendingCount} <span className="text-xs font-normal text-slate-500">tài khoản</span>
          </div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-600">Đã khóa</div>
          <div className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${lockedCount > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
            {lockedCount} <span className="text-xs font-normal text-slate-500">tài khoản</span>
          </div>
        </div>
      </div>

      {isError && (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          title="Chưa tải được danh sách nhân sự"
          description={error?.message || 'Không thể lấy dữ liệu nhân sự lúc này.'}
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      )}

      {pendingUsers.length > 0 && (
        <div className="light-surface-box mb-6 rounded-xl border border-amber-200/80 bg-amber-50/30 p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
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
            loading={isLoading && !data}
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
        loading={isLoading && !data}
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

      <Modal
        title={`Chọn người thay — ${editTarget?.name || ''}`}
        open={!!handover}
        onCancel={() => {
          setHandover(null);
          setReplacement(undefined);
        }}
        onOk={() => updateMutation.mutate({ id: handover.id, payload: { ...handover.payload, replacementCaretaker: replacement } })}
        okText="Chuyển việc và lưu"
        okButtonProps={{ disabled: !replacement }}
        confirmLoading={updateMutation.isPending}
        destroyOnHidden
      >
        <p className="mb-2 text-sm">Người này đang phụ trách:</p>
        <ul className="mb-3 list-disc pl-5 text-sm">
          {handover?.stalls?.length > 0 && <li>Chuồng {handover.stalls.join(', ')}</li>}
          {handover?.horses?.length > 0 && <li>Ngựa {handover.horses.join(', ')}</li>}
          {handover?.pendingTasks > 0 && <li>{handover.pendingTasks} việc chưa làm từ hôm nay</li>}
        </ul>
        {replacementOptions.length ? (
          <Form layout="vertical">
            <Form.Item label="Nhân viên chăm sóc nhận thay" extra="Chuồng, ngựa và việc chưa làm chuyển sang người này ngay khi lưu.">
              <Select placeholder="Chọn người thay" options={replacementOptions} value={replacement} onChange={setReplacement} />
            </Form.Item>
          </Form>
        ) : (
          <Alert
            type="warning"
            showIcon
            title="Chưa có nhân viên chăm sóc nào khác đang hoạt động"
            description="Tạo hoặc duyệt thêm một nhân viên chăm sóc, rồi khóa tài khoản này sau."
          />
        )}
      </Modal>
    </div>
  );
}
