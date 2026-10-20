import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Select, Input, InputNumber, Tag, Alert, Popconfirm, Space, Empty, Tabs, Card } from 'antd';
import { message } from '../../lib/antdStatic';
import { EditOutlined, DeleteOutlined, HomeOutlined, PlusOutlined, AppstoreAddOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stableAssignmentApi, stallApi } from './stableApi';
import { horsesApi } from '../horses/horsesApi';
import { usersApi } from '../admin/usersApi';
import { ROLES } from '../../constants/roles';
import { HEALTH_LABELS, HEALTH_COLORS } from '../../constants/health';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import StableMapBoard from './StableMapBoard';
import { STALL_TYPE_LABELS } from './stall3d/stallStatus';

/**
 * Manager assigns each horse a stall and the groom responsible for it.
 *
 * This was the missing link in the chain: the endpoints existed and the daily-task generator
 * depended on these records, but no screen had ever created one — so the only assignments in the
 * system came from the seed script, and a horse added through the UI would silently never get fed.
 *
 * The stable map (docs/STALL_API.md): zones of stalls laid out by the Manager, shown as a map and as
 * the barn in 3D; a horse goes into an empty stall picked from that catalogue. Before any zone exists,
 * the stall is typed as before.
 */
export default function StableAssignmentPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [tab, setTab] = useState('map');
  const [form] = Form.useForm();
  const [zoneForm] = Form.useForm();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: assignmentsData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stable-assignments'],
    queryFn: () => stableAssignmentApi.list(),
  });
  const { data: stallsData, isLoading: stallsLoading, isError: stallsError, refetch: refetchStalls } = useQuery({
    queryKey: ['stalls'],
    queryFn: () => stallApi.map(),
  });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: groomsData } = useQuery({
    queryKey: ['users', ROLES.GROOM],
    queryFn: () => usersApi.list({ role: ROLES.GROOM }),
  });

  const assignments = assignmentsData?.data || [];
  const stalls = stallsData?.data?.stalls || [];
  const unplaced = stallsData?.data?.unplaced || [];
  const horses = horsesData?.data || [];
  const grooms = (groomsData?.data || []).filter((u) => u.isActive !== false);

  const assignedHorseIds = new Set(assignments.map((a) => a.horse?._id || a.horse));
  const unstabled = horses.filter((h) => !assignedHorseIds.has(h._id));
  // Where each horse is now: shown in the picker, and its caretaker goes along when it moves. Saving
  // updates the horse's one assignment (the server upserts by horse), so picking a horse that already
  // has a stall moves it — every horse that came in before the map has a hand-written stall.
  const assignmentByHorse = new Map(assignments.map((a) => [String(a.horse?._id || a.horse), a]));
  const whereNow = (a) => (!a ? 'chưa có chuồng' : a.stall?.code ? `đang ở ${a.stall.code}` : `chuồng ghi tay ${a.stableBlock}`);
  const placeOrder = (h) => { const a = assignmentByHorse.get(String(h._id)); return !a ? 0 : a.stall ? 2 : 1; };
  const pickedNow = assignmentByHorse.get(String(Form.useWatch('horse', form)));
  const moveNote = pickedNow
    ? pickedNow.stall?.code
      ? `Ngựa sẽ chuyển khỏi chuồng ${pickedNow.stall.code}.`
      : `Chuồng ghi tay “${pickedNow.stableBlock}” sẽ được thay bằng chuồng chọn dưới đây.`
    : null;
  const uncared = assignments.filter((a) => !a.assignedCaretaker);
  const hasMap = stalls.length > 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stable-assignments'] });
    queryClient.invalidateQueries({ queryKey: ['stalls'] });
    queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload) => stableAssignmentApi.upsert(payload),
    onSuccess: () => {
      message.success('Đã lưu phân công chuồng trại.');
      invalidate();
      setOpen(false);
      setEditing(null);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Lưu thất bại.'),
  });

  const removeMutation = useMutation({
    mutationFn: (id) => stableAssignmentApi.remove(id),
    onSuccess: () => {
      message.success('Đã gỡ phân công.');
      invalidate();
    },
    onError: (err) => message.error(err.message || 'Gỡ phân công thất bại.'),
  });

  const maintenanceMutation = useMutation({
    mutationFn: ({ stall, on }) => stallApi.update(stall._id, { status: on ? 'maintenance' : 'active' }),
    onSuccess: (_, { stall, on }) => {
      message.success(on ? `Chuồng ${stall.code} đang bảo trì.` : `Đã mở lại chuồng ${stall.code}.`);
      invalidate();
    },
    onError: (err) => message.error(err.message || 'Không đổi được trạng thái chuồng.'),
  });

  const zoneMutation = useMutation({
    mutationFn: (values) => stallApi.generateZone(values),
    onSuccess: (res) => {
      const made = res?.data?.created?.length || 0;
      const skipped = res?.data?.skipped?.length || 0;
      message.success(`Đã tạo ${made} chuồng${skipped ? `, bỏ qua ${skipped} mã đã có` : ''}.`);
      invalidate();
      setZoneOpen(false);
      zoneForm.resetFields();
      setTab('map');
    },
    onError: (err) => message.error(err.message || 'Không tạo được khu chuồng.'),
  });

  /** record: an assignment (table row) or { assignment, horse, caretaker, stall } from the map. */
  const openModal = (record, presetHorseId, presetStall) => {
    const normalized = record && (record.assignment
      ? { _id: record.assignment, horse: record.horse, assignedCaretaker: record.caretaker, stall: record.stall }
      : record);
    setEditing(normalized || null);
    form.setFieldsValue({
      horse: normalized ? normalized.horse?._id || normalized.horse : presetHorseId,
      stall: presetStall?._id || normalized?.stall?._id || undefined,
      stableBlock: normalized?.stableBlock,
      assignedCaretaker: normalized?.assignedCaretaker?._id || normalized?.assignedCaretaker,
    });
    setOpen(true);
  };

  // ?horse=<id> (from the horse list or a horse's stall card) lands with that horse's form open: its
  // assignment to change, or a new one with the horse picked. Opened once per link, then dropped from
  // the URL so a reload or Back does not open it again.
  const linkedHorse = searchParams.get('horse');
  const [linkOpened, setLinkOpened] = useState(null);
  if (!linkedHorse && linkOpened) setLinkOpened(null);
  if (linkedHorse && linkOpened !== linkedHorse && assignmentsData && horsesData) {
    setLinkOpened(linkedHorse);
    const current = assignmentByHorse.get(linkedHorse);
    openModal(current || null, current ? undefined : linkedHorse);
  }
  useEffect(() => {
    if (!linkOpened || !searchParams.has('horse')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('horse');
    setSearchParams(next, { replace: true });
  }, [linkOpened, searchParams, setSearchParams]);

  // Stalls a horse can go into: in use, not under maintenance, empty (or the one it is in now).
  const editingHorseId = editing?.horse?._id || editing?.horse;
  const stallOptions = Object.values(
    stalls
      .filter((s) => s.status !== 'maintenance' && (!s.occupied || (editingHorseId && s.occupant?.horse?._id === editingHorseId)))
      .reduce((groups, s) => {
        (groups[s.zone] ||= { label: s.zoneName, options: [] }).options.push({
          value: s._id,
          label: `${s.code}${s.type !== 'standard' ? ` · ${STALL_TYPE_LABELS[s.type]}` : ''}`,
        });
        return groups;
      }, {}),
  );

  const columns = [
    {
      title: 'Ngựa',
      key: 'horse',
      render: (_, r) => (
        <Space orientation="vertical" size={0}>
          <Link to={`/horses/${r.horse?._id}`}>{r.horse?.name}</Link>
          {r.horse?.healthStatus && (
            <Tag color={HEALTH_COLORS[r.horse.healthStatus]} className="!mt-1">
              {HEALTH_LABELS[r.horse.healthStatus] || r.horse.healthStatus}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Chuồng',
      dataIndex: 'stableBlock',
      key: 'stableBlock',
      render: (v, r) => (
        <Space>
          <HomeOutlined className="text-gray-400" />
          {v}
          {hasMap && !r.stall && <Tag>chưa có trên sơ đồ</Tag>}
        </Space>
      ),
    },
    {
      title: 'Nhân viên chăm sóc',
      key: 'assignedCaretaker',
      render: (_, r) =>
        r.assignedCaretaker ? (
          r.assignedCaretaker.name
        ) : (
          <Tag color="orange">Chưa gán — ngựa sẽ không được tự tạo việc cho ăn</Tag>
        ),
    },
    {
      title: '',
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>
            Sửa
          </Button>
          <Popconfirm
            title="Gỡ ngựa này khỏi chuồng?"
            description="Việc cho ăn hàng ngày sẽ ngừng được tạo tự động."
            okText="Gỡ"
            cancelText="Huỷ"
            onConfirm={() => removeMutation.mutate(r._id)}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={removeMutation.isPending && removeMutation.variables === r._id}
              disabled={removeMutation.isPending && removeMutation.variables === r._id}
            >
              Gỡ
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const busyId = (maintenanceMutation.isPending && maintenanceMutation.variables?.stall?._id) || (removeMutation.isPending && removeMutation.variables) || null;
  const mapTab = stallsError ? (
    <Alert
      type="error"
      showIcon
      title="Chưa tải được sơ đồ chuồng"
      action={<Button size="small" onClick={() => refetchStalls()}>Thử lại</Button>}
    />
  ) : hasMap ? (
    <StableMapBoard
      stalls={stalls}
      unplaced={unplaced}
      canManage
      busyId={busyId}
      onAssign={(stall) => openModal(null, undefined, stall)}
      onEdit={(record) => openModal(record)}
      onRemove={(id) => removeMutation.mutate(id)}
      onMaintenance={(stall, on) => maintenanceMutation.mutate({ stall, on })}
    />
  ) : (
    <Card loading={stallsLoading && !stallsData} className="!rounded-xl !border-[#E2D9C8]">
      <Empty
        description={
          <div className="text-sm text-gray-600">
            Chưa có sơ đồ chuồng. Tạo khu đầu tiên (ví dụ Khu A với 8 chuồng) để thấy cả khu dạng 3D và xếp ngựa bằng cách chọn chuồng trống.
          </div>
        }
      >
        <Button type="primary" icon={<AppstoreAddOutlined />} onClick={() => setZoneOpen(true)}>
          Tạo khu chuồng
        </Button>
      </Empty>
    </Card>
  );

  return (
    <div>
      <PageHeroBanner
        eyebrow="Vận hành chuồng trại"
        roleLabel="Quản lý CLB"
        title="Phân công chuồng trại & nhân viên chăm sóc"
        subtitle="Mỗi ngựa cần một ô chuồng và một nhân viên chăm sóc phụ trách để hệ thống tự tạo việc cho ăn hằng ngày và kiểm tra điều kiện trước buổi tập."
        actionButton={
          <Space wrap>
            <Button icon={<AppstoreAddOutlined />} onClick={() => setZoneOpen(true)} className="!h-9 !rounded-lg font-semibold cursor-pointer">
              Thêm khu chuồng
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openModal(null)}
              disabled={horses.length === 0}
              className="!h-9 !px-4 !rounded-lg !bg-[#D4AF37] hover:!bg-[#E2C058] !border-[#D4AF37] !text-[#061812] font-semibold cursor-pointer"
            >
              Xếp chuồng mới
            </Button>
          </Space>
        }
      />

      <div className="light-surface-box grid grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E4DFD3] mb-5 rounded-xl bg-[#FAF7F0] border border-[#E5DEC9] shadow-xs overflow-hidden">
        <div className="p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-600">Tổng đàn ngựa</div>
          <div className="text-xl sm:text-2xl font-bold text-[#0F5A43] tabular-nums mt-1">{horses.length} <span className="text-xs font-normal text-slate-500">ngựa</span></div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-600">Đã xếp chuồng</div>
          <div className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums mt-1">{assignments.length} <span className="text-xs font-normal text-slate-500">ô chuồng</span></div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-600">Chưa xếp chuồng</div>
          <div className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${unstabled.length > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
            {unstabled.length} <span className="text-xs font-normal text-slate-500">ngựa</span>
          </div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-600">Chưa gán người chăm sóc</div>
          <div className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${uncared.length > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
            {uncared.length} <span className="text-xs font-normal text-slate-500">chuồng</span>
          </div>
        </div>
      </div>

      {unstabled.length > 0 && (
        <Alert
          className="!mb-3"
          type="warning"
          showIcon
          title={`${unstabled.length} ngựa chưa được xếp chuồng`}
          description={
            <div className="text-sm">
              {unstabled.map((h) => (
                <Button key={h._id} size="small" type="link" className="!px-1" onClick={() => openModal(null, h._id)}>
                  {h.name}
                </Button>
              ))}
            </div>
          }
        />
      )}

      {uncared.length > 0 && (
        <Alert
          className="!mb-3"
          type="warning"
          showIcon
          title={`${uncared.length} chuồng chưa có người chăm sóc`}
          description="Ngựa trong các chuồng này sẽ không được tự tạo việc cho ăn, và buổi tập của chúng sẽ hiện cảnh báo."
        />
      )}

      {isError && (
        <Alert
          type="error"
          showIcon
          className="!mb-3"
          title="Chưa tải được danh sách phân công chuồng trại"
          description={error?.message || 'Không thể lấy dữ liệu phân công chuồng lúc này.'}
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      )}

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'map', label: 'Sơ đồ chuồng', children: mapTab },
          {
            key: 'list',
            label: 'Danh sách',
            children: (
              <Table
                rowKey="_id"
                columns={columns}
                dataSource={assignments}
                loading={isLoading && !assignmentsData}
                scroll={{ x: 'max-content' }}
                locale={{
                  emptyText: (
                    <Empty description="Chưa xếp chuồng cho ngựa nào.">
                      {unstabled.length > 0 && (
                        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openModal(null)}>
                          Xếp chuồng mới
                        </Button>
                      )}
                    </Empty>
                  ),
                }}
              />
            ),
          },
        ]}
      />

      <Modal
        title={editing ? `Sửa phân công — ${editing.horse?.name}` : 'Xếp chuồng cho ngựa'}
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => saveMutation.mutate(hasMap ? { horse: values.horse, stall: values.stall, assignedCaretaker: values.assignedCaretaker } : values)}
        >
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]} extra={!editing && moveNote}>
            <Select
              disabled={Boolean(editing)}
              showSearch
              optionFilterProp="label"
              placeholder="Chọn ngựa"
              onChange={(id) => {
                const caretaker = assignmentByHorse.get(String(id))?.assignedCaretaker;
                if (caretaker) form.setFieldValue('assignedCaretaker', caretaker._id || caretaker);
              }}
              options={[...horses]
                .sort((a, b) => placeOrder(a) - placeOrder(b))
                .map((h) => ({ value: h._id, label: editing ? h.name : `${h.name} (${whereNow(assignmentByHorse.get(String(h._id)))})` }))}
            />
          </Form.Item>
          {hasMap ? (
            <Form.Item
              name="stall"
              label="Chuồng"
              rules={[{ required: true, message: 'Chọn một chuồng trống' }]}
              extra="Chỉ hiện chuồng trống, không bảo trì. Thêm chuồng ở nút “Thêm khu chuồng”."
            >
              <Select showSearch optionFilterProp="label" placeholder="Chọn chuồng" options={stallOptions} notFoundContent="Hết chuồng trống" />
            </Form.Item>
          ) : (
            <Form.Item
              name="stableBlock"
              label="Chuồng"
              rules={[{ required: true, message: 'Nhập khu và số ô chuồng' }]}
              extra="Chưa có sơ đồ chuồng: ghi tay theo dạng “A-12”, hoặc tạo khu ở nút “Thêm khu chuồng” để chọn từ sơ đồ."
            >
              <Input placeholder="A-12" />
            </Form.Item>
          )}
          <Form.Item
            name="assignedCaretaker"
            label="Nhân viên chăm sóc"
            extra="Người này sẽ tự động nhận việc cho ăn hàng ngày và việc chăm sóc sau buổi tập nặng."
          >
            <Select
              allowClear
              placeholder="Chưa gán"
              options={grooms.map((u) => ({ value: u._id, label: u.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Thêm khu chuồng"
        open={zoneOpen}
        onCancel={() => setZoneOpen(false)}
        onOk={() => zoneForm.submit()}
        confirmLoading={zoneMutation.isPending}
        okText="Tạo chuồng"
        destroyOnHidden
      >
        <Form
          form={zoneForm}
          layout="vertical"
          initialValues={{ count: 8, type: 'standard' }}
          onFinish={(values) => zoneMutation.mutate({ ...values, zone: values.zone.trim().toUpperCase() })}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item name="zone" label="Mã khu" rules={[{ required: true, pattern: /^[A-Za-z0-9]{1,4}$/, message: '1–4 chữ hoặc số, ví dụ A, B, CL' }]} extra="Mã chuồng sẽ là <mã khu>-01, -02…">
              <Input placeholder="A" maxLength={4} />
            </Form.Item>
            <Form.Item name="count" label="Số chuồng" rules={[{ required: true }]}>
              <InputNumber min={1} max={40} className="!w-full" />
            </Form.Item>
          </div>
          <Form.Item name="zoneName" label="Tên khu" rules={[{ required: true, message: 'Ví dụ: Khu A' }]}>
            <Input placeholder="Khu A" maxLength={60} />
          </Form.Item>
          <Form.Item name="zonePurpose" label="Dùng cho">
            <Input placeholder="Ngựa đua chủ lực" maxLength={120} />
          </Form.Item>
          <Form.Item name="type" label="Loại chuồng">
            <Select options={Object.entries(STALL_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
