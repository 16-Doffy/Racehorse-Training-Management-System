import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Select, Input, Tag, Alert, Popconfirm, Space, Empty, Tabs, Card } from 'antd';
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
import ZoneModal, { ZoneEditModal } from './ZoneModal';
import { CaretakerSelect, StallPicker } from './StallPicker';
import { stallGroom } from './stallPicking';
import { newestFirst } from '../../utils/newestFirst';

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
  const [zoneEditing, setZoneEditing] = useState(null);
  const [tab, setTab] = useState('map');
  const [form] = Form.useForm();
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

  // A stall's groom, or a whole zone's: the horses in them and their open work go along (server side).
  const groomMutation = useMutation({
    mutationFn: ({ stall, caretaker }) => stallApi.setCaretaker(stall._id, caretaker),
    onSuccess: (_, { stall, caretaker }) => {
      const name = grooms.find((g) => g._id === caretaker)?.name;
      message.success(name ? `Đã giao chuồng ${stall.code} cho ${name}.` : `Đã bỏ người chăm sóc của chuồng ${stall.code}.`);
      invalidate();
    },
    onError: (err) => message.error(err.message || 'Không đổi được người chăm sóc.'),
  });

  // The zone dialog saves everything at once: name, stalls taken out, stalls added.
  const zoneEditMutation = useMutation({
    mutationFn: ({ zone, values }) => stallApi.editZone(zone.key, values),
    onSuccess: (res, { values }) => {
      const { removed = [], added = [] } = res?.data || {};
      const parts = [
        removed.length ? `bỏ ${removed.join(', ')}` : null,
        added.length ? `thêm ${added.join(', ')}` : null,
      ].filter(Boolean);
      message.success(`Đã lưu "${values.zoneName}"${parts.length ? `: ${parts.join(' · ')}` : ''}.`);
      invalidate();
      setZoneEditing(null);
    },
    onError: (err) => message.error(err.message || 'Không sửa được khu.'),
  });
  const zoneRetireMutation = useMutation({
    mutationFn: (zone) => stallApi.retireZone(zone.key),
    onSuccess: (res, zone) => {
      message.success(`Đã xoá ${zone.name} (${res?.data?.retired?.length || zone.stalls.length} chuồng).`);
      invalidate();
    },
    onError: (err) => message.error(err.message || 'Không xoá được khu.'),
  });
  const stallRetireMutation = useMutation({
    mutationFn: (stall) => stallApi.retire(stall._id),
    onSuccess: (_, stall) => {
      message.success(`Đã bỏ chuồng ${stall.code}.`);
      invalidate();
    },
    onError: (err) => message.error(err.message || 'Không bỏ được chuồng.'),
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
      assignedCaretaker: normalized?.assignedCaretaker?._id || normalized?.assignedCaretaker || stallGroom(presetStall) || undefined,
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

  // The horse in the form: its own stall stays pickable in the stall picker, and it does not count
  // towards its groom's load. The picked stall's zone suggests the groom who already works there.
  const formHorseId = Form.useWatch('horse', form);
  const formStallId = Form.useWatch('stall', form);
  const formStall = stalls.find((s) => s._id === formStallId);

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

  const groomBusy = groomMutation.isPending ? `stall:${groomMutation.variables?.stall?._id}` : null;
  const busyId =
    (maintenanceMutation.isPending && maintenanceMutation.variables?.stall?._id) ||
    (removeMutation.isPending && removeMutation.variables) ||
    groomBusy ||
    (zoneRetireMutation.isPending && `retire:${zoneRetireMutation.variables?.key}`) ||
    (stallRetireMutation.isPending && `retire-stall:${stallRetireMutation.variables?._id}`) ||
    null;
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
      grooms={grooms}
      onSetCaretaker={(stall, caretaker) => groomMutation.mutateAsync({ stall, caretaker }).catch(() => {})}
      onEditZone={(zone) => setZoneEditing(zone)}
      onRetireZone={(zone) => zoneRetireMutation.mutateAsync(zone).catch(() => {})}
      onRetireStall={(stall) => stallRetireMutation.mutateAsync(stall).catch(() => {})}
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
        title="Chuồng trại & người chăm sóc"
        subtitle="Mỗi ngựa cần một ô chuồng và một nhân viên chăm sóc phụ trách để hệ thống tự tạo việc cho ăn hằng ngày và kiểm tra điều kiện trước buổi tập."
        stats={[
          { label: 'Tổng đàn', value: `${horses.length} ngựa` },
          { label: 'Đã xếp chuồng', value: `${assignments.length} ngựa` },
          { label: 'Chưa xếp chuồng', value: `${unstabled.length} ngựa` },
          { label: 'Chưa có người chăm sóc', value: `${uncared.length} ngựa` },
          { label: 'Chuồng trống', value: `${stalls.filter((st) => !st.occupied && st.status !== 'maintenance').length}/${stalls.length}` },
        ]}
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

      {(unstabled.length > 0 || unplaced.length > 0 || uncared.length > 0) && (
        // What still needs the Manager, in one place: horses without a stall, horses on a hand-written
        // stall, stalls whose horse has nobody to feed it. Each name opens its stall form.
        <div className="light-surface-box mb-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm">
          <div className="mb-1.5 font-semibold text-amber-900">Cần xử lý</div>
          <div className="space-y-1.5">
            {unstabled.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <span className="mr-1 text-gray-700">{unstabled.length} ngựa chưa có chuồng:</span>
                {unstabled.map((h) => (
                  <Button key={h._id} size="small" type="link" className="!h-auto !px-1 !py-0" onClick={() => openModal(null, h._id)}>
                    {h.name}
                  </Button>
                ))}
              </div>
            )}
            {unplaced.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <span className="mr-1 text-gray-700">{unplaced.length} ngựa ở chuồng ghi tay, chưa có trên sơ đồ:</span>
                {unplaced.map((u) => (
                  <Button
                    key={u.assignment}
                    size="small"
                    type="link"
                    className="!h-auto !px-1 !py-0"
                    onClick={() => openModal({ assignment: u.assignment, horse: u.horse, caretaker: u.caretaker })}
                  >
                    {u.horse.name} ({u.stableBlock})
                  </Button>
                ))}
              </div>
            )}
            {uncared.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <span className="mr-1 text-gray-700">{uncared.length} ngựa chưa có người chăm sóc (không được tự tạo việc cho ăn):</span>
                {uncared.map((a) => (
                  <Button key={a._id} size="small" type="link" className="!h-auto !px-1 !py-0" onClick={() => openModal(a)}>
                    {a.horse?.name} ({a.stableBlock})
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
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
                dataSource={newestFirst(assignments)}
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
        okText={formStall ? `Xếp vào ${formStall.code}` : 'Lưu'}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
        width={640}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onValuesChange={(changed) => {
            // A stall comes with its groom: the horse placed there is theirs to look after.
            if (!('stall' in changed)) return;
            const groom = stallGroom(stalls.find((s) => s._id === changed.stall));
            if (groom) form.setFieldValue('assignedCaretaker', groom);
          }}
          onFinish={(values) => saveMutation.mutate(hasMap ? { horse: values.horse, stall: values.stall, assignedCaretaker: values.assignedCaretaker } : values)}
        >
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true, message: 'Chọn ngựa' }]} extra={!editing && moveNote} className="!mb-4">
            <Select
              disabled={Boolean(editing)}
              showSearch
              optionFilterProp="label"
              placeholder="Chọn ngựa"
              onChange={(id) => {
                // The picked stall's own groom comes first; otherwise the horse keeps the one it has.
                if (stallGroom(formStall)) return;
                const caretaker = assignmentByHorse.get(String(id))?.assignedCaretaker;
                if (caretaker) form.setFieldValue('assignedCaretaker', caretaker._id || caretaker);
              }}
              options={[...horses]
                .sort((a, b) => placeOrder(a) - placeOrder(b))
                .map((h) => ({ value: h._id, label: editing ? h.name : `${h.name} (${whereNow(assignmentByHorse.get(String(h._id)))})` }))}
            />
          </Form.Item>
          {hasMap ? (
            <Form.Item name="stall" label="Chuồng" rules={[{ required: true, message: 'Chọn một chuồng trống' }]} className="!mb-4">
              <StallPicker stalls={stalls} horseId={formHorseId} />
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
            extra="Người này tự nhận việc cho ăn hằng ngày và việc chăm sóc sau buổi tập nặng của ngựa."
            className="!mb-1"
          >
            <CaretakerSelect grooms={grooms} stalls={stalls} unplaced={unplaced} stall={formStall} horseId={formHorseId} />
          </Form.Item>
        </Form>
      </Modal>

      <ZoneModal
        open={zoneOpen}
        stalls={stalls}
        onClose={() => setZoneOpen(false)}
        onCreated={() => {
          invalidate();
          setZoneOpen(false);
          setTab('map');
        }}
      />

      {zoneEditing && (
        <ZoneEditModal
          key={`zone-edit:${zoneEditing.key}`}
          zone={zoneEditing}
          saving={zoneEditMutation.isPending}
          onClose={() => setZoneEditing(null)}
          onSave={(values) => zoneEditMutation.mutate({ zone: zoneEditing, values })}
        />
      )}
    </div>
  );
}
