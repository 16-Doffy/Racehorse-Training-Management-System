import { useState } from 'react';
import { Table, Tag, Typography, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Alert, Empty, Tooltip, Popconfirm, Segmented } from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, EditOutlined, DownloadOutlined, DeleteOutlined, RollbackOutlined } from '@ant-design/icons';
import { downloadFile } from '../../lib/files';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { horsesApi } from './horsesApi';
import { usersApi } from '../admin/usersApi';
import { ROLES } from '../../constants/roles';
import { HEALTH_LABELS, HEALTH_COLORS, TRAINING_LEVEL_META } from '../../constants/health';

const { Title } = Typography;


export default function HorseListPage() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  // Creating/editing a horse and assigning who is responsible for it is the Club Manager's job
  // (POST/PUT /horses is Manager-only on the server); every other role sees the same read-only
  // roster they always had.
  const isManager = user?.role === ROLES.MANAGER;

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const horses = data?.data || [];

  // Manager: horses the club no longer manages, kept for their records.
  const [view, setView] = useState('active');
  const { data: archivedData, isLoading: archivedLoading } = useQuery({
    queryKey: ['horses', 'archived'],
    queryFn: () => horsesApi.list({ archived: 'true' }),
    enabled: isManager && view === 'archived',
  });
  const archivedHorses = archivedData?.data || [];
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveReason, setArchiveReason] = useState('');
  const refreshHorses = () => queryClient.invalidateQueries({ queryKey: ['horses'] });

  const deleteMutation = useMutation({
    mutationFn: (horse) => horsesApi.remove(horse._id),
    onSuccess: () => {
      message.success('Đã xoá ngựa.');
      refreshHorses();
    },
    // A horse with records can't be deleted; the server says so and the Manager can stop
    // managing it instead.
    onError: (err, horse) => {
      if (err.status === 409 && err.data?.canArchive) {
        setArchiveTarget({ ...horse, blockedReason: err.message });
      } else {
        message.error(err.message || 'Xoá thất bại.');
      }
    },
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, reason }) => horsesApi.archive(id, { reason }),
    onSuccess: (res) => {
      message.success(res.message || 'Đã ngừng quản lý ngựa.');
      setArchiveTarget(null);
      setArchiveReason('');
      refreshHorses();
    },
    onError: (err) => message.error(err.message || 'Thao tác thất bại.'),
  });
  const unarchiveMutation = useMutation({
    mutationFn: (horse) => horsesApi.unarchive(horse._id),
    onSuccess: (res) => {
      message.success(res.message || 'Đã khôi phục.');
      refreshHorses();
    },
    onError: (err) => message.error(err.message || 'Khôi phục thất bại.'),
  });

  // A horse with an empty slot is invisible to whoever should have been in it — no owner means
  // its owner can't follow it, no trainer means no one plans its training, no vet means no one
  // watches its health. Only the Manager can see the gap, so only the Manager can close it.
  const incomplete = isManager
    ? horses.filter((h) => !h.owner || !h.assignedTrainer || !h.assignedVet)
    : [];

  // Assignee dropdowns — only fetched for the Manager, who is the only role that can assign.
  const { data: trainersData } = useQuery({
    queryKey: ['users', ROLES.HEAD_TRAINER],
    queryFn: () => usersApi.list({ role: ROLES.HEAD_TRAINER }),
    enabled: isManager,
  });
  const { data: vetsData } = useQuery({
    queryKey: ['users', ROLES.VETERINARIAN],
    queryFn: () => usersApi.list({ role: ROLES.VETERINARIAN }),
    enabled: isManager,
  });
  const { data: ownersData } = useQuery({
    queryKey: ['users', ROLES.OWNER],
    queryFn: () => usersApi.list({ role: ROLES.OWNER }),
    enabled: isManager,
  });

  const activeOptions = (res) =>
    (res?.data || [])
      .filter((u) => u.isActive)
      .map((u) => ({ value: u._id, label: u.name }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['horses'] });

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editTarget ? horsesApi.update(editTarget._id, payload) : horsesApi.create(payload),
    onSuccess: () => {
      message.success(editTarget ? 'Đã cập nhật hồ sơ ngựa.' : 'Đã thêm ngựa mới.');
      invalidate();
      setFormOpen(false);
      setEditTarget(null);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Lưu thất bại.'),
  });

  const openCreate = () => {
    setEditTarget(null);
    form.resetFields();
    setFormOpen(true);
  };

  const openEdit = (record) => {
    setEditTarget(record);
    form.setFieldsValue({
      name: record.name,
      breed: record.breed,
      color: record.color,
      dob: record.dob ? dayjs(record.dob) : null,
      weightKg: record.weightKg,
      owner: record.owner?._id || record.owner,
      assignedTrainer: record.assignedTrainer?._id || record.assignedTrainer,
      assignedVet: record.assignedVet?._id || record.assignedVet,
    });
    setFormOpen(true);
  };

  const columns = [
    { title: 'Tên ngựa', dataIndex: 'name', key: 'name' },
    { title: 'Giống', dataIndex: 'breed', key: 'breed' },
    { title: 'Màu lông', dataIndex: 'color', key: 'color' },
    {
      title: 'Chủ sở hữu',
      dataIndex: ['owner', 'name'],
      key: 'owner',
      // For the Manager this is an actionable gap, not just a blank — same treatment as the
      // trainer/vet columns below.
      render: (v) => v || (isManager ? <Tag>Chưa gán</Tag> : '—'),
    },
    {
      title: 'Trạng thái sức khỏe',
      dataIndex: 'healthStatus',
      key: 'healthStatus',
      render: (status) => <Tag color={HEALTH_COLORS[status]}>{HEALTH_LABELS[status] || status}</Tag>,
    },
    {
      title: 'Tập luyện',
      key: 'trainingClearance',
      render: (_, h) => {
        const c = h.trainingClearance || { level: 'high' };
        const meta = TRAINING_LEVEL_META[c.level];
        return c.restricted ? (
          <Tooltip title={[c.reason, c.prescribedBy && `Bác sĩ ${c.prescribedBy}`].filter(Boolean).join(' — ') || 'Theo phác đồ điều trị'}>
            <Tag color={meta.color}>{meta.short}</Tag>
          </Tooltip>
        ) : (
          <Tag color={meta.color}>{meta.short}</Tag>
        );
      },
    },
  ];

  // Who's responsible matters to the Manager (they assign it) — other roles already only see the
  // horses assigned to them, so the columns would just repeat their own name on every row.
  if (isManager) {
    columns.push(
      {
        title: 'HLV phụ trách',
        dataIndex: ['assignedTrainer', 'name'],
        key: 'assignedTrainer',
        render: (v) => v || <Tag>Chưa gán</Tag>,
      },
      {
        title: 'Bác sĩ phụ trách',
        dataIndex: ['assignedVet', 'name'],
        key: 'assignedVet',
        render: (v) => v || <Tag>Chưa gán</Tag>,
      },
      {
        title: '',
        key: 'actions',
        render: (_, record) =>
          view === 'archived' ? (
            <Button
              size="small"
              icon={<RollbackOutlined />}
              loading={unarchiveMutation.isPending && unarchiveMutation.variables?._id === record._id}
              onClick={(e) => {
                e.stopPropagation();
                unarchiveMutation.mutate(record);
              }}
            >
              Khôi phục
            </Button>
          ) : (
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                Sửa
              </Button>
              <Popconfirm
                title={`Xoá ngựa "${record.name}"?`}
                description="Chỉ xoá được ngựa chưa có buổi tập, hồ sơ khám hay giải đua."
                okText="Xoá"
                cancelText="Huỷ"
                okButtonProps={{ danger: true }}
                onConfirm={() => deleteMutation.mutate(record)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} loading={deleteMutation.isPending && deleteMutation.variables?._id === record._id}>
                  Xoá
                </Button>
              </Popconfirm>
            </div>
          ),
      }
    );
    if (view === 'archived') {
      columns.splice(columns.length - 1, 0, {
        title: 'Ngừng quản lý',
        key: 'archived',
        render: (_, h) => (
          <span className="text-sm">
            {h.archivedReason || '—'}
            {h.archivedAt && <span className="text-gray-400"> · {dayjs(h.archivedAt).format('DD/MM/YYYY')}</span>}
          </span>
        ),
      });
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <div>
          <Title level={3} className="!mb-0">
            {isManager ? 'Danh mục Ngựa' : 'Danh sách Ngựa'}
          </Title>
          {isManager && (
            <Typography.Text type="secondary" className="text-sm">
              Thêm/sửa hồ sơ ngựa và gán Huấn luyện viên, Bác sĩ thú y phụ trách. Mỗi HLV/bác sĩ
              chỉ thấy đúng những con ngựa bạn phân công cho họ.
            </Typography.Text>
          )}
        </div>
        {isManager && (
          <div className="flex gap-2">
            <Button
              icon={<DownloadOutlined />}
              onClick={() => downloadFile('/export/horses', `danh-sach-ngua-${new Date().toISOString().slice(0, 10)}.csv`).catch((e) => message.error(e.message || 'Xuất file thất bại.'))}
            >
              Xuất CSV
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Thêm ngựa mới
            </Button>
          </div>
        )}
      </div>

      {incomplete.length > 0 && (
        <Alert
          className="mb-3"
          type="warning"
          showIcon
          title={`${incomplete.length} ngựa chưa đủ người phụ trách`}
          description={
            <>
              Ngựa thiếu <b>chủ sở hữu</b> thì không chủ ngựa nào theo dõi được, thiếu <b>HLV</b>{' '}
              thì không ai lập kế hoạch huấn luyện, thiếu <b>bác sĩ</b> thì không ai theo dõi sức
              khỏe. Bấm “Sửa” ở các dòng bên dưới để bổ sung:{' '}
              <b>{incomplete.map((h) => h.name).join(', ')}</b>.
            </>
          }
        />
      )}

      {isManager && (
        <Segmented
          className="!mb-3"
          value={view}
          onChange={setView}
          options={[
            { value: 'active', label: `Đang quản lý (${horses.length})` },
            { value: 'archived', label: 'Đã ngừng quản lý' },
          ]}
        />
      )}

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={view === 'archived' ? archivedHorses : horses}
        loading={view === 'archived' ? archivedLoading : isLoading}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: isManager ? (
            'Chưa có ngựa nào trong danh mục. Nhấn "Thêm ngựa mới" để bắt đầu.'
          ) : (
            <Empty
              description={
                <span>
                  Bạn chưa được phân công phụ trách con ngựa nào.
                  <br />
                  Liên hệ Quản lý Câu lạc bộ để được phân công.
                </span>
              }
            />
          ),
        }}
        onRow={(record) => ({ onClick: () => navigate(`/horses/${record._id}`) })}
        rowClassName="cursor-pointer"
      />

      {isManager && (
        <Modal
          title={archiveTarget ? `Ngừng quản lý — ${archiveTarget.name}` : ''}
          open={Boolean(archiveTarget)}
          okText="Ngừng quản lý"
          cancelText="Huỷ"
          okButtonProps={{ danger: true, disabled: !archiveReason.trim() }}
          confirmLoading={archiveMutation.isPending}
          onCancel={() => {
            setArchiveTarget(null);
            setArchiveReason('');
          }}
          onOk={() => archiveMutation.mutate({ id: archiveTarget._id, reason: archiveReason.trim() })}
          destroyOnHidden
        >
          {archiveTarget?.blockedReason && <Alert className="!mb-3" type="info" showIcon title={archiveTarget.blockedReason} />}
          <Typography.Paragraph className="!text-sm">
            Ngựa sẽ rời khỏi mọi danh sách làm việc: gỡ chuồng (ngừng sinh việc chăm sóc), hủy các buổi tập đã xếp và kế
            hoạch đang mở, rút các giải sắp tới. Hồ sơ huấn luyện, khám chữa bệnh và thành tích vẫn được giữ lại; bạn có
            thể khôi phục bất cứ lúc nào.
          </Typography.Paragraph>
          <Select
            className="w-full !mb-2"
            placeholder="Chọn nhanh lý do"
            onChange={setArchiveReason}
            options={['Đã bán', 'Nghỉ hưu', 'Chuyển sang câu lạc bộ khác', 'Ngựa đã chết'].map((v) => ({ value: v, label: v }))}
          />
          <Input.TextArea rows={2} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} placeholder="Lý do ngừng quản lý (bắt buộc)" />
        </Modal>
      )}

      {isManager && (
        <Modal
          title={editTarget ? `Sửa hồ sơ — ${editTarget.name}` : 'Thêm ngựa mới'}
          open={formOpen}
          onCancel={() => {
            setFormOpen(false);
            setEditTarget(null);
          }}
          onOk={() => form.submit()}
          confirmLoading={saveMutation.isPending}
          destroyOnHidden
          width={620}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) =>
              saveMutation.mutate({ ...values, dob: values.dob ? values.dob.toISOString() : undefined })
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Form.Item name="name" label="Tên ngựa" rules={[{ required: true }]} className="!mb-3">
                <Input placeholder="VD: Thunder Bolt" />
              </Form.Item>
              <Form.Item name="breed" label="Giống" className="!mb-3">
                <Input placeholder="VD: Thoroughbred" />
              </Form.Item>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
              <Form.Item name="color" label="Màu lông" className="!mb-3">
                <Input placeholder="VD: Bay" />
              </Form.Item>
              <Form.Item name="dob" label="Ngày sinh" className="!mb-3">
                <DatePicker className="w-full" format="DD/MM/YYYY" />
              </Form.Item>
              <Form.Item name="weightKg" label="Cân nặng (kg)" className="!mb-3">
                <InputNumber min={50} max={1200} className="w-full" />
              </Form.Item>
            </div>
            <Form.Item name="owner" label="Chủ sở hữu" className="!mb-3">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Chọn chủ sở hữu"
                options={activeOptions(ownersData)}
              />
            </Form.Item>
            <Form.Item
              name="assignedTrainer"
              label="Huấn luyện viên phụ trách"
              extra="Chỉ HLV được gán mới thấy và lập kế hoạch huấn luyện cho ngựa này."
              className="!mb-3"
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Chưa gán — chưa HLV nào thấy ngựa này"
                options={activeOptions(trainersData)}
              />
            </Form.Item>
            <Form.Item
              name="assignedVet"
              label="Bác sĩ thú y phụ trách"
              extra="Yêu cầu khám cho ngựa này sẽ gửi thẳng tới bác sĩ được gán."
              className="!mb-3"
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Chưa gán — chưa bác sĩ nào thấy ngựa này"
                options={activeOptions(vetsData)}
              />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  );
}
