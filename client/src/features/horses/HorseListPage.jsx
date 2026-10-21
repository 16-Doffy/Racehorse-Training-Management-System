import { useState } from 'react';
import { Table, Tag, Typography, Button, Modal, Form, Input, Select, Alert, Empty, Tooltip, Popconfirm, Segmented } from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, EditOutlined, DownloadOutlined, DeleteOutlined, RollbackOutlined } from '@ant-design/icons';
import { downloadFile } from '../../lib/files';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { horsesApi } from './horsesApi';
import { usersApi } from '../admin/usersApi';
import { stableAssignmentApi, stallApi } from '../stable/stableApi';
import { ROLES } from '../../constants/roles';
import { HEALTH_LABELS, HEALTH_COLORS, TRAINING_LEVEL_META } from '../../constants/health';
import HorseNextStep from './HorseNextStep';
import { HORSE_SEX_LABELS } from '../../constants/horse';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import HorseFormModal from './HorseFormModal';

const { Title } = Typography;

export default function HorseListPage() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  // Creating/editing a horse and assigning who is responsible for it is the Club Manager's job
  // (POST/PUT /horses is Manager-only on the server); every other role sees the same read-only
  // roster they always had.
  const isManager = user?.role === ROLES.MANAGER;
  // The Horse Owner has their own list (features/owner/OwnerHorses.jsx).
  // The Manager and the trainer run a horse from arrival to training: they see its next step.
  const showsNextStep = [ROLES.MANAGER, ROLES.HEAD_TRAINER].includes(user?.role);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const horses = data?.data || [];
  const { data: checklistData } = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists(), enabled: showsNextStep });
  const checklistByHorse = new Map((checklistData?.data || []).map((c) => [String(c.horse._id), c]));
  // The stall of each horse, from the stable map (a horse still on a free-text stall shows that text).
  const { data: stallsData } = useQuery({ queryKey: ['stalls'], queryFn: () => stallApi.map(), enabled: showsNextStep });
  const stallByHorse = new Map([
    ...(stallsData?.data?.unplaced || []).map((u) => [String(u.horse._id), u.stableBlock]),
    ...(stallsData?.data?.stalls || []).filter((st) => st.occupant?.horse).map((st) => [String(st.occupant.horse._id), st.code]),
  ]);
  const mapStalls = stallsData?.data?.stalls || [];
  // Has a vet examined the horse? true / false, or undefined while that is still loading.
  const examined = (h) => checklistByHorse.get(String(h._id))?.items?.find((i) => i.key === 'health')?.done;

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
  const unexaminedCount = horses.filter((h) => examined(h) === false).length;
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
  // A new horse can go straight into a stall, with its groom.
  const { data: groomsData } = useQuery({
    queryKey: ['users', ROLES.GROOM],
    queryFn: () => usersApi.list({ role: ROLES.GROOM }),
    enabled: isManager,
  });
  const grooms = (groomsData?.data || []).filter((u) => u.isActive !== false);

  const activeOptions = (res) =>
    (res?.data || [])
      .filter((u) => u.isActive)
      .map((u) => ({ value: u._id, label: u.name }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['horses'] });

  const saveMutation = useMutation({
    mutationFn: async ({ stall, caretaker, ...payload }) => {
      if (editTarget) return { horse: (await horsesApi.update(editTarget._id, payload)).data };
      const horse = (await horsesApi.create(payload)).data;
      if (!stall) return { horse };
      // The horse exists from here on. A stall someone took in the meantime leaves it without a stall
      // (said below, placed from the Chuồng column), never makes the Manager create it twice.
      try {
        await stableAssignmentApi.upsert({ horse: horse._id, stall, assignedCaretaker: caretaker || undefined });
        return { horse, stall: mapStalls.find((s) => s._id === stall) };
      } catch (placeError) {
        return { horse, placeError };
      }
    },
    onSuccess: ({ horse, stall, placeError }) => {
      if (editTarget) message.success('Đã cập nhật hồ sơ ngựa.');
      else if (placeError) message.warning(`Đã thêm ${horse?.name || 'ngựa'} nhưng chưa xếp được chuồng: ${placeError.message || 'lỗi không rõ'}. Bấm "Xếp chuồng" ở cột Chuồng để xếp lại.`, 8);
      else if (stall) message.success(`Đã thêm ${horse?.name || 'ngựa'} vào chuồng ${stall.code}.`);
      else message.success('Đã thêm ngựa mới.');
      invalidate();
      if (stall || placeError) {
        queryClient.invalidateQueries({ queryKey: ['stalls'] });
        queryClient.invalidateQueries({ queryKey: ['stable-assignments'] });
      }
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
        examined(h) === false ? (
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
    columns.splice(1, 0, {
      title: 'Chuồng',
      key: 'stall',
      render: (_, h) => {
        const code = stallByHorse.get(String(h._id));
        // The Manager places horses: the cell opens that horse's stall form on the stable page.
        if (isManager) {
          return (
            <Button
              size="small"
              type="link"
              className="!px-0 tabular-nums"
              onClick={(e) => {
                e.stopPropagation(); // not the row's click, which opens the horse
                navigate(`/admin/stables?horse=${h._id}`);
              }}
            >
              {code || 'Xếp chuồng'}
            </Button>
          );
        }
        return code ? <span className="tabular-nums whitespace-nowrap">{code}</span> : <Tag>Chưa xếp</Tag>;
      },
    });
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
        eyebrow="Hồ sơ & danh mục ngựa"
        roleLabel={isManager ? 'Quản lý CLB' : 'HLV trưởng'}
        title={isManager ? 'Danh mục & quản lý đàn ngựa' : 'Danh sách ngựa phụ trách'}
        subtitle={
          isManager
            ? 'Cập nhật hồ sơ lý lịch và phân công huấn luyện viên, bác sĩ thú y phụ trách từng ngựa.'
            : 'Theo dõi thể trạng, mức độ cho phép tập luyện và bước chuẩn bị tiếp theo của từng ngựa.'
        }
        stats={[
          { label: 'Tổng đàn', value: `${horses.length} con` },
          { label: 'Đủ điều kiện tập', value: `${readyCount} con` },
          { label: 'Cần theo dõi', value: `${watchCount} con` },
        ]}
        actionButton={
          isManager ? (
            <div className="flex flex-wrap gap-2">
              <Button
                icon={<DownloadOutlined />}
                onClick={() => downloadFile('/export/horses', `danh-sach-ngua-${new Date().toISOString().slice(0, 10)}.csv`).catch((e) => message.error(e.message || 'Xuất file thất bại.'))}
                className="!h-9 !rounded-lg !bg-white/10 hover:!bg-white/15 !border-white/20 !text-white"
              >
                Xuất CSV
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openCreate}
                className="!h-9 !px-4 !rounded-lg !bg-[#D4AF37] hover:!bg-[#E2C058] !border-[#D4AF37] !text-[#061812] font-semibold cursor-pointer"
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

      {showsNextStep && (
        <div className="light-surface-box grid grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E4DFD3] mb-5 rounded-xl bg-[#FAF7F0] border border-[#E5DEC9] shadow-xs overflow-hidden">
          <div className="p-3.5 sm:p-4">
            <div className="text-xs font-medium text-slate-600">Tổng đàn ngựa</div>
            <div className="text-xl sm:text-2xl font-bold text-[#0F5A43] tabular-nums mt-1">{horses.length} <span className="text-xs font-normal text-slate-500">ngựa</span></div>
          </div>
          <div className="p-3.5 sm:p-4">
            <div className="text-xs font-medium text-slate-600">Đủ điều kiện tập</div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums mt-1">{readyCount} <span className="text-xs font-normal text-slate-500">ngựa</span></div>
            {unexaminedCount > 0 && <div className="text-[11px] text-slate-500 mt-0.5">{unexaminedCount} ngựa chưa khám</div>}
          </div>
          <div className="p-3.5 sm:p-4">
            <div className="text-xs font-medium text-slate-600">Theo dõi y tế</div>
            <div className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${watchCount > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
              {watchCount} <span className="text-xs font-normal text-slate-500">ngựa</span>
            </div>
            {restrictedCount > 0 && <div className="text-[11px] text-slate-500 mt-0.5">{restrictedCount} ngựa bị hạn chế tập</div>}
          </div>
          <div className="p-3.5 sm:p-4">
            <div className="text-xs font-medium text-slate-600">{isManager ? 'Khuyết phụ trách' : 'Chưa có kế hoạch'}</div>
            <div className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${gapCount > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
              {gapCount} <span className="text-xs font-normal text-slate-500">ngựa</span>
            </div>
          </div>
        </div>
      )}

      {isError && (
        <Alert
          className="mb-3"
          type="error"
          showIcon
          title="Chưa tải được danh sách đàn ngựa"
          description={error?.message || 'Không thể lấy dữ liệu đàn ngựa lúc này.'}
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
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
        <div className="mb-3 max-w-full overflow-x-auto">
          <Segmented
            size="small"
            value={view}
            onChange={setView}
            options={[
              { value: 'active', label: `Đang quản lý (${horses.length})` },
              { value: 'archived', label: 'Đã ngừng quản lý' },
            ]}
          />
        </div>
      )}

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={view === 'archived' ? archivedHorses : horses}
        loading={view === 'archived' ? archivedLoading && !archivedData : isLoading && !data}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: isManager ? (
            <Empty description='Chưa có ngựa nào trong danh mục. Nhấn "Thêm ngựa mới" để bắt đầu.'>
              {view === 'active' && (
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
                  Thêm ngựa mới
                </Button>
              )}
            </Empty>
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
        <HorseFormModal
          open={formOpen}
          editTarget={editTarget}
          form={form}
          saving={saveMutation.isPending}
          onCancel={() => {
            setFormOpen(false);
            setEditTarget(null);
          }}
          onFinish={(values) =>
            // Cleared optional fields are sent as '' / null so the server removes them.
            saveMutation.mutate({
              ...values,
              dob: values.dob ? values.dob.toISOString() : undefined,
              breed: values.breed ?? '',
              color: values.color ?? '',
              sex: values.sex ?? '',
              microchipNumber: values.microchipNumber ?? '',
              registrationNumber: values.registrationNumber ?? '',
              valuationVnd: values.valuationVnd ?? null,
            })
          }
          ownerOptions={activeOptions(ownersData)}
          trainerOptions={activeOptions(trainersData)}
          vetOptions={activeOptions(vetsData)}
          stalls={mapStalls}
          unplaced={stallsData?.data?.unplaced || []}
          grooms={grooms}
          currentStall={editTarget ? stallByHorse.get(String(editTarget._id)) : undefined}
          onOpenStable={() => editTarget && navigate(`/admin/stables?horse=${editTarget._id}`)}
        />
      )}
    </div>
  );
}
