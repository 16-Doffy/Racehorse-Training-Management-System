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
import HorseNextStep from './HorseNextStep';
import { HORSE_SEX_LABELS, horseSexOptions } from '../../constants/horse';
import PageHeroBanner from '../../components/common/PageHeroBanner';

const { Title } = Typography;


export default function HorseListPage() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  // Creating/editing a horse and assigning who is responsible for it is the Club Manager's job
  // (POST/PUT /horses is Manager-only on the server); every other role sees the same read-only
  // roster they always had.
  const isManager = user?.role === ROLES.MANAGER;
  // The Manager and the trainer run a horse from arrival to training: they see its next step.
  const showsNextStep = [ROLES.MANAGER, ROLES.HEAD_TRAINER].includes(user?.role);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const horses = data?.data || [];
  const { data: checklistData } = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists(), enabled: showsNextStep });
  const checklistByHorse = new Map((checklistData?.data || []).map((c) => [String(c.horse._id), c]));

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

  // Counted the way the dashboard counts them. A new horse is "eligible" in the record before any vet
  // has seen it, so "ready" also needs an exam on file and no medical restriction; an unexamined horse
  // is counted on its own rather than as healthy.
  const checkItem = (h, key) => checklistByHorse.get(String(h._id))?.items?.find((i) => i.key === key)?.done;
  const readyCount = horses.filter((h) => h.healthStatus === 'eligible' && checkItem(h, 'health') && checkItem(h, 'clearance')).length;
  const unexaminedCount = horses.filter((h) => checkItem(h, 'health') === false).length;
  const restrictedCount = horses.filter((h) => h.trainingClearance?.restricted).length;
  const watchCount = horses.filter((h) => ['monitoring', 'injured', 'quarantined'].includes(h.healthStatus) || h.trainingClearance?.restricted).length;
  // The Manager closes staffing gaps; the trainer closes planning gaps.
  const gapCount = isManager ? incomplete.length : horses.filter((h) => checkItem(h, 'plan') === false).length;

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
      sex: record.sex,
      microchipNumber: record.microchipNumber,
      registrationNumber: record.registrationNumber,
      valuationVnd: record.valuationVnd ?? null,
      owner: record.owner?._id || record.owner,
      assignedTrainer: record.assignedTrainer?._id || record.assignedTrainer,
      assignedVet: record.assignedVet?._id || record.assignedVet,
    });
    setFormOpen(true);
  };

  const columns = [
    { title: 'Tên ngựa', dataIndex: 'name', key: 'name' },
    { title: 'Giống', dataIndex: 'breed', key: 'breed' },
    { title: 'Giới tính', dataIndex: 'sex', key: 'sex', render: (v) => HORSE_SEX_LABELS[v] || '—' },
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
      // A horse nobody has examined yet starts as "eligible" in the record; say what is true instead.
      render: (status, h) =>
        checklistByHorse.get(String(h._id))?.items?.find((i) => i.key === 'health')?.done === false ? (
          <Tooltip title="Bác sĩ chưa khám tiếp nhận ngựa này — bài nặng và chạy thử cần giấy khám.">
            <Tag>Chưa khám</Tag>
          </Tooltip>
        ) : (
          <Tag color={HEALTH_COLORS[status]}>{HEALTH_LABELS[status] || status}</Tag>
        ),
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

  if (showsNextStep && view === 'active') {
    columns.push({
      title: 'Bước tiếp theo',
      key: 'nextStep',
      width: 220,
      render: (_, h) => <HorseNextStep checklist={checklistByHorse.get(String(h._id))} />,
    });
  }

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
      {showsNextStep ? (
      <PageHeroBanner
        eyebrow="TEAM 8 • QUẢN LÝ ĐÀN CHIẾN MÃ"
        roleLabel={isManager ? 'Club Manager' : 'Head Trainer'}
        title={isManager ? 'Danh Mục & Quản Lý Chiến Mã' : 'Danh Sách Chiến Mã Phụ Trách'}
        subtitle={
          isManager
            ? 'Thêm/sửa hồ sơ ngựa và phân công Huấn luyện viên, Bác sĩ thú y phụ trách toàn diện.'
            : 'Theo dõi thể trạng, lịch sử thi đấu và phân bổ kế hoạch tác chiến cho từng chiến mã.'
        }
        stats={[
          { label: 'Tổng đàn', value: `${horses.length} con` },
          { label: 'Đủ điều kiện tập', value: `${readyCount} con` },
          { label: 'Cần theo dõi', value: `${watchCount} con` },
        ]}
        actionButton={
          isManager ? (
            <div className="flex gap-2">
              <Button
                icon={<DownloadOutlined />}
                onClick={() => downloadFile('/export/horses', `danh-sach-ngua-${new Date().toISOString().slice(0, 10)}.csv`).catch((e) => message.error(e.message || 'Xuất file thất bại.'))}
                className="!bg-white/10 hover:!bg-white/20 !border-white/20 !text-white"
              >
                Xuất CSV
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openCreate}
                className="!bg-gradient-to-r !from-amber-600 !to-amber-700 hover:!from-amber-500 hover:!to-amber-600 !border-amber-400/40 !text-white font-semibold cursor-pointer"
              >
                Thêm ngựa mới
              </Button>
            </div>
          ) : null
        }
      />
      ) : (
        <Title level={3} className="!mb-4">
          Danh sách Ngựa
        </Title>
      )}

      {/* KPI Ribbon - Mẫu 1 Prestige British Racing */}
      {showsNextStep && (
        <div className="light-surface-box grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5 p-3 rounded-xl bg-white border border-[#E4DFD3] shadow-xs">
          <div className="px-3 py-1.5 border-r border-[#E4DFD3] last:border-r-0">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tổng Đàn Ngựa</div>
            <div className="text-xl font-bold text-[#0F5A43] tabular-nums mt-0.5">{horses.length} <span className="text-xs font-normal text-slate-500">chiến mã</span></div>
          </div>
          <div className="px-3 py-1.5 border-r border-[#E4DFD3] last:border-r-0">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Đủ Điều Kiện Tập</div>
            <div className="text-xl font-bold text-emerald-700 tabular-nums mt-0.5">{readyCount} <span className="text-xs font-normal text-slate-500">ngựa</span></div>
            {unexaminedCount > 0 && <div className="text-[11px] text-slate-500">{unexaminedCount} ngựa chưa khám</div>}
          </div>
          <div className="px-3 py-1.5 border-r border-[#E4DFD3] last:border-r-0">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Theo Dõi Y Tế</div>
            <div className={`text-xl font-bold tabular-nums mt-0.5 ${watchCount > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
              {watchCount} <span className="text-xs font-normal text-slate-500">ngựa</span>
            </div>
            {restrictedCount > 0 && <div className="text-[11px] text-slate-500">{restrictedCount} ngựa bị hạn chế tập</div>}
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{isManager ? 'Khuyết Phụ Trách' : 'Chưa Có Kế Hoạch'}</div>
            <div className={`text-xl font-bold tabular-nums mt-0.5 ${gapCount > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
              {gapCount} <span className="text-xs font-normal text-slate-500">ngựa</span>
            </div>
          </div>
        </div>
      )}

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
              // Cleared optional fields are sent as '' / null so the server removes them.
              saveMutation.mutate({
                ...values,
                dob: values.dob ? values.dob.toISOString() : undefined,
                sex: values.sex ?? '',
                microchipNumber: values.microchipNumber ?? '',
                registrationNumber: values.registrationNumber ?? '',
                valuationVnd: values.valuationVnd ?? null,
              })
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
              <Form.Item name="sex" label="Giới tính" className="!mb-3">
                <Select allowClear placeholder="Chọn giới tính" options={horseSexOptions} />
              </Form.Item>
              <Form.Item
                name="microchipNumber"
                label="Số vi mạch"
                className="!mb-3"
                rules={[{ pattern: /^[A-Za-z0-9]{9,15}$/, message: '9–15 chữ số hoặc chữ cái' }]}
              >
                <Input placeholder="VD: 985141002345678" maxLength={15} />
              </Form.Item>
              <Form.Item name="registrationNumber" label="Số đăng ký" className="!mb-3">
                <Input placeholder="Số trong sổ giống" maxLength={40} />
              </Form.Item>
            </div>
            <Form.Item name="valuationVnd" label="Định giá (₫)" className="!mb-3" extra="Chỉ Quản lý và chủ ngựa thấy.">
              <InputNumber
                min={0}
                step={1000000}
                className="w-full"
                formatter={(v) => (v === undefined || v === null || v === '' ? '' : Number(v).toLocaleString('vi-VN'))}
                parser={(v) => (v ? v.replace(/[^0-9]/g, '') : '')}
                placeholder="VD: 500.000.000"
              />
            </Form.Item>
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
