import { useState } from 'react';
import {
  Table,
  Button,
  Typography,
  Modal,
  Form,
  Select,
  DatePicker,
  Tag,
  Popover,
  Input,
  Tabs,
  Space,
  TimePicker,
  Tooltip,
  Popconfirm,
  Segmented,
  InputNumber,
} from 'antd';
import { message } from '../../lib/antdStatic';
import {
  PlusOutlined,
  WarningFilled,
  RobotOutlined,
  EditOutlined,
  DeleteOutlined,
  StopOutlined,
  MedicineBoxOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { dailyTaskApi, incidentApi } from './stableApi';
import { horsesApi } from '../horses/horsesApi';
import { usersApi } from '../admin/usersApi';
import { feedingApi } from '../feeding/feedingApi';
import { inventoryApi } from '../inventory/inventoryApi';
import { ROLES } from '../../constants/roles';
import {
  APPETITE_LABELS,
  APPETITE_COLORS,
  TASK_TYPE_LABELS as TASK_LABELS,
  ASSIGNABLE_TASK_TYPES,
  TASK_TIMING_META,
  INCIDENT_STATUS_META,
  INCIDENT_SEVERITY_META,
  incidentStatusOf,
} from '../../constants/care';

const { Title, Text } = Typography;
const STATUS_LABELS = { pending: 'Chưa thực hiện', completed: 'Đã hoàn thành', skipped: 'Đã bỏ qua' };
const STATUS_COLORS = { pending: 'default', completed: 'green', skipped: 'orange' };
const SEVERITY_LABELS = { low: 'Nhẹ', medium: 'Trung bình', high: 'Nghiêm trọng' };
const SEVERITY_COLORS = { low: 'gold', medium: 'orange', high: 'red' };
const MEAL_LABELS = { morning: 'Bữa sáng', noon: 'Bữa trưa', evening: 'Bữa chiều' };
const DEFAULT_MEAL_TIMES = { morning: '06:00', noon: '11:30', evening: '17:30' };

const FEED_TYPE_OPTIONS = [
  { value: 'grain', label: 'Cám / ngũ cốc' },
  { value: 'hay', label: 'Cỏ khô' },
  { value: 'grass', label: 'Cỏ tươi' },
  { value: 'vitamin', label: 'Vitamin' },
  { value: 'electrolyte', label: 'Bù điện giải' },
  { value: 'supplement', label: 'Thực phẩm bổ sung' },
];
const FEED_TYPE_LABELS = Object.fromEntries(FEED_TYPE_OPTIONS.map((o) => [o.value, o.label]));

/* -------------------------------------------------------------------------- */
/* Worklist                                                                    */
/* -------------------------------------------------------------------------- */

function TaskList() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['daily-tasks-all'], queryFn: () => dailyTaskApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: groomsData } = useQuery({
    queryKey: ['users', ROLES.GROOM],
    queryFn: () => usersApi.list({ role: ROLES.GROOM }),
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }) => (id ? dailyTaskApi.update(id, payload) : dailyTaskApi.create(payload)),
    onSuccess: () => {
      message.success(editing ? 'Đã cập nhật công việc.' : 'Đã phân công công việc.');
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
      setOpen(false);
      setEditing(null);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Thao tác thất bại.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => dailyTaskApi.remove(id),
    onSuccess: () => {
      message.success('Đã xoá công việc.');
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
    },
    onError: (err) => message.error(err.message || 'Xoá thất bại.'),
  });

  // Meals are recreated by the hourly generator if deleted, so calling one off is a "skip": the
  // record stays, the groom sees it was cancelled, and the readiness check knows the horse didn't eat.
  const skipMutation = useMutation({
    mutationFn: (id) => dailyTaskApi.update(id, { status: 'skipped' }),
    onSuccess: () => {
      message.success('Đã cho bỏ bữa này.');
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
    },
    onError: (err) => message.error(err.message || 'Thao tác thất bại.'),
  });

  const openModal = (record) => {
    setEditing(record || null);
    form.setFieldsValue(
      record
        ? {
            horse: record.horse?._id || record.horse,
            assignedTo: record.assignedTo?._id || record.assignedTo,
            taskType: record.taskType,
            scheduledDate: record.scheduledDate ? dayjs(record.scheduledDate) : null,
            note: record.note,
          }
        : { scheduledDate: dayjs() }
    );
    setOpen(true);
  };

  const columns = [
    {
      title: 'Ngựa',
      dataIndex: ['horse', 'name'],
      key: 'horse',
      render: (name, record) => <Link to={`/horses/${record.horse?._id}`}>{name}</Link>,
    },
    { title: 'Người phụ trách', dataIndex: ['assignedTo', 'name'], key: 'assignedTo' },
    {
      title: 'Công việc',
      key: 'taskType',
      render: (_, r) => (
        <div className="min-w-[180px]">
          <Space size={4} wrap>
            <span>{TASK_LABELS[r.taskType] || r.taskType}</span>
            {r.mealSlot && <Tag>{MEAL_LABELS[r.mealSlot]}</Tag>}
            {r.dueTime && <Tag color="purple">💊 {r.dueTime}</Tag>}
            {r.source === 'vet' && (
              // The vet's care order, created from a treatment — shown here so the trainer sees
              // the horse is under treatment, but not theirs to change.
              <Tooltip title="Bác sĩ chỉ định qua phác đồ điều trị">
                <Tag color="magenta" icon={<MedicineBoxOutlined />}>
                  Y lệnh bác sĩ
                </Tag>
              </Tooltip>
            )}
            {r.trainingSession && (
              // Distinguishes work the system created from a finished hard session from work the
              // trainer assigned by hand, so nobody wonders where a task came from.
              <Tooltip title="Tự sinh sau buổi tập nặng">
                <Tag color="blue" icon={<RobotOutlined />}>
                  Từ buổi tập
                </Tag>
              </Tooltip>
            )}
          </Space>
          {r.note && (
            <Text type="secondary" className="block !text-xs mt-1">
              {r.note}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Thời gian',
      dataIndex: 'scheduledDate',
      key: 'scheduledDate',
      render: (d) => new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, r) => (
        <div className="flex flex-wrap gap-1">
          {r.status === 'skipped' && r.skipReason ? (
            // The groom reported they could not do it — show why, not just "skipped".
            <Tooltip title={r.skipReason}>
              <Tag color="red" className="!m-0">
                NV báo không làm được
              </Tag>
            </Tooltip>
          ) : (
            <Tag color={STATUS_COLORS[r.status]} className="!m-0">
              {STATUS_LABELS[r.status] || r.status}
            </Tag>
          )}
          {r.status === 'pending' && TASK_TIMING_META[r.timing?.state] && (
            <Tooltip title={r.timing.reason}>
              <Tag color={TASK_TIMING_META[r.timing.state].color} className="!m-0">
                {TASK_TIMING_META[r.timing.state].label}
              </Tag>
            </Tooltip>
          )}
          {r.status === 'pending' && r.supplyStatus && !r.supplyStatus.ok && (
            // The groom can't tick this until the stock is topped up (the server refuses it too).
            <Tooltip
              title={`Thiếu: ${r.supplyStatus.missing.map((m) => `${m.name} (cần ${m.needed} ${m.unit}, còn ${m.available})`).join('; ')}`}
            >
              <Tag color="red" className="!m-0">
                Thiếu vật tư
              </Tag>
            </Tooltip>
          )}
          {r.status === 'pending' && r.acknowledgedAt && (
            <Tag color="blue" className="!m-0">
              Đã tiếp nhận {dayjs(r.acknowledgedAt).format('HH:mm')}
            </Tag>
          )}
          {r.observation?.appetite && (
            <Tag color={APPETITE_COLORS[r.observation.appetite]} className="!mt-1">
              {APPETITE_LABELS[r.observation.appetite]}
              {r.observation.amountEatenPercent != null ? ` ${r.observation.amountEatenPercent}%` : ''}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Sự cố',
      key: 'incident',
      render: (_, record) => {
        const incident = record.incidentReport;
        if (!incident) return <span className="text-gray-400">—</span>;
        const state = INCIDENT_STATUS_META[incidentStatusOf(incident)];
        return (
          <Popover
            title="Chi tiết sự cố"
            content={
              <div className="max-w-xs">
                <Tag color={SEVERITY_COLORS[incident.severity]}>{SEVERITY_LABELS[incident.severity] || incident.severity}</Tag>
                <p className="mt-2 mb-0">{incident.description}</p>
                {incident.images?.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1 mb-0">{incident.images.length} ảnh đính kèm</p>
                )}
                {incident.response && <p className="mt-2 mb-0">Bác sĩ: {incident.response}</p>}
              </div>
            }
          >
            <Tag color={state.color} icon={<WarningFilled />} className="cursor-pointer">
              {state.label}
            </Tag>
          </Popover>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_, r) => {
        // Done or called-off work is a record, not something to edit (the server refuses too).
        if (r.status !== 'pending') return <span className="text-gray-400">—</span>;
        // Its window on the real clock has closed (a meal past its time, yesterday's dose):
        // it stays on record as missed and can't be changed — the server refuses too.
        if (r.timing && !r.timing.canChange) return <Text type="secondary" className="!text-xs">Đã quá hạn</Text>;
        // The vet's orders change through the treatment, not from here (the server refuses too).
        if (r.source === 'vet') return <Text type="secondary" className="!text-xs">Do bác sĩ quản lý</Text>;
        const isMeal = r.taskType === 'feeding';
        return (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>
              Sửa
            </Button>
            {isMeal ? (
              <Popconfirm
                title="Cho ngựa bỏ bữa này?"
                description="Nhân viên sẽ thấy bữa đã bị hủy; hệ thống không tạo lại."
                onConfirm={() => skipMutation.mutate(r._id)}
                okText="Bỏ bữa"
                cancelText="Huỷ"
              >
                <Button size="small" icon={<StopOutlined />} loading={skipMutation.isPending && skipMutation.variables === r._id}>
                  Bỏ bữa
                </Button>
              </Popconfirm>
            ) : (
              <Popconfirm
                title="Xoá công việc này?"
                onConfirm={() => deleteMutation.mutate(r._id)}
                okText="Xoá"
                cancelText="Huỷ"
              >
                <Button size="small" danger icon={<DeleteOutlined />} loading={deleteMutation.isPending && deleteMutation.variables === r._id}>
                  Xoá
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <Typography.Text type="secondary" className="text-sm max-w-3xl">
          Việc cho ăn được tự động tạo theo khẩu phần đã duyệt (xem tab bên cạnh), và việc chăm sóc
          sau buổi tập nặng — ngâm chân, tắm — cũng tự sinh khi bạn kết thúc buổi tập. Việc dùng thuốc
          và theo dõi do bác sĩ chỉ định qua phác đồ điều trị. Bạn chỉ cần giao thêm những việc phát sinh. Ghi nhận của nhân viên về việc ăn uống sẽ quay lại ảnh
          hưởng tới điều kiện xếp lịch tập.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>
          Giao việc phát sinh
        </Button>
      </div>

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={data?.data}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Chưa có công việc nào. Việc cho ăn sẽ tự xuất hiện khi ngựa đã được xếp chuồng và có người chăm sóc.' }}
      />

      <Modal
        title={editing ? "Sửa công việc" : "Giao việc phát sinh"}
        open={open}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            saveMutation.mutate({ 
              id: editing?._id, 
              payload: { ...values, scheduledDate: values.scheduledDate?.toISOString() } 
            })
          }
        >
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select options={(horsesData?.data || []).map((h) => ({ value: h._id, label: h.name }))} />
          </Form.Item>
          <Form.Item name="assignedTo" label="Nhân viên chăm sóc" rules={[{ required: true }]}>
            <Select options={(groomsData?.data || []).map((u) => ({ value: u._id, label: u.name }))} />
          </Form.Item>
          <Form.Item name="taskType" label="Loại công việc" rules={[{ required: true }]}>
            <Select
              // Meals come from the rations; an existing meal can be reassigned but stays a meal.
              disabled={editing?.taskType === 'feeding'}
              options={(editing?.taskType === 'feeding' ? ['feeding'] : ASSIGNABLE_TASK_TYPES).map((value) => ({
                value,
                label: TASK_LABELS[value],
              }))}
            />
          </Form.Item>
          <Form.Item name="scheduledDate" label="Ngày thực hiện" rules={[{ required: true }]}>
            <DatePicker
              className="w-full"
              // Work is handed out for today or later; a meal's day is fixed by its ration.
              disabled={editing?.taskType === 'feeding'}
              disabledDate={(d) => d && d < dayjs().startOf('day')}
            />
          </Form.Item>
          <Form.Item name="note" label="Dặn dò cho nhân viên" extra="Hiện ngay trên việc của họ.">
            <Input.TextArea rows={2} placeholder="VD: Ngâm chân trước 20 phút, kiểm tra kỹ gân chân trái." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rations                                                                     */
/* -------------------------------------------------------------------------- */

function RationList() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['feeding'], queryFn: () => feedingApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  // Ration items come from the Manager's stock list (food only), with what is in stock now.
  const { data: inventoryData } = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const feedItems = (inventoryData?.data || []).filter((i) => i.category === 'feed' && !i.isProposed);
  const feedById = new Map(feedItems.map((i) => [i._id, i]));
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeForm] = Form.useForm();
  const proposeMutation = useMutation({
    mutationFn: (payload) => inventoryApi.propose({ ...payload, category: 'feed' }),
    onSuccess: () => {
      message.success('Đã gửi đề xuất vật tư mới cho Quản lý.');
      setProposeOpen(false);
      proposeForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err) => message.error(err.message || 'Gửi đề xuất thất bại.'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['feeding'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }) => (id ? feedingApi.update(id, payload) : feedingApi.create(payload)),
    onSuccess: (_res, { payload }) => {
      message.success(editing ? 'Đã cập nhật khẩu phần.' : 'Đã tạo khẩu phần.');
      // Mirrors utils/taskTiming.js on the server: a meal is recordable until 4h after its time.
      const at = dayjs(`${dayjs().format('YYYY-MM-DD')} ${payload.timeOfDay || DEFAULT_MEAL_TIMES[payload.mealTime]}`);
      if (at.add(4, 'hour').isBefore(dayjs())) {
        message.info('Hôm nay đã qua giờ bữa này — việc cho ăn sẽ bắt đầu từ ngày mai.');
      }
      invalidate();
      setOpen(false);
      setEditing(null);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Lưu khẩu phần thất bại.'),
  });

  const openModal = (record) => {
    setEditing(record || null);
    form.setFieldsValue(
      record
        ? {
            horse: record.horse?._id || record.horse,
            mealTime: record.mealTime,
            timeOfDay: dayjs(record.timeOfDay || DEFAULT_MEAL_TIMES[record.mealTime], 'HH:mm'),
            // Linked items load as stock item + amount; older text items are kept and shown so
            // the trainer can re-pick them from stock.
            items: record.items?.length
              ? record.items.map((i) =>
                  i.inventoryItem ? { inventoryItem: i.inventoryItem._id || i.inventoryItem, amount: i.amount } : { legacyType: i.type, legacyQuantity: i.quantity }
                )
              : [{}],
          }
        : { mealTime: 'morning', timeOfDay: dayjs(DEFAULT_MEAL_TIMES.morning, 'HH:mm'), items: [{}] }
    );
    setOpen(true);
  };

  const columns = [
    {
      title: 'Ngựa',
      dataIndex: ['horse', 'name'],
      key: 'horse',
      render: (name, r) => <Link to={`/horses/${r.horse?._id}`}>{name}</Link>,
    },
    {
      title: 'Bữa',
      key: 'mealTime',
      render: (_, r) => (
        <Space>
          <Tag>{MEAL_LABELS[r.mealTime] || r.mealTime}</Tag>
          <Text type="secondary" className="!text-xs">
            {r.timeOfDay || DEFAULT_MEAL_TIMES[r.mealTime]}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Khẩu phần',
      key: 'items',
      render: (_, r) =>
        r.items?.length ? (
          <div className="flex flex-col gap-0.5 text-sm">
            {r.items.map((i, idx) => {
              const stock = i.inventoryItem;
              const short = stock && typeof stock.quantity === 'number' && stock.quantity < (i.amount || 0);
              return (
                <span key={idx}>
                  {stock ? `${stock.name} ${i.amount} ${stock.unit}` : `${FEED_TYPE_LABELS[i.type] || i.type} ${i.quantity}`}
                  {stock && (
                    <Text type={short ? 'danger' : 'secondary'} className="!text-xs ml-1">
                      (kho còn {stock.quantity} {stock.unit})
                    </Text>
                  )}
                  {!stock && (
                    <Text type="warning" className="!text-xs ml-1">
                      (chưa liên kết kho)
                    </Text>
                  )}
                </span>
              );
            })}
          </div>
        ) : (
          <span className="text-gray-400">Chưa có món nào</span>
        ),
    },
    {
      title: 'Duyệt',
      key: 'approvedBy',
      render: (_, r) =>
        r.approvedBy ? (
          <Tag color="green">Đã duyệt — {r.approvedBy.name}</Tag>
        ) : (
          <Tag color="gold">Chờ duyệt</Tag>
        ),
    },
    {
      title: '',
      key: 'actions',
      render: (_, r) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>
          Sửa
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <Typography.Text type="secondary" className="text-sm max-w-3xl">
          Khẩu phần là lịch ăn cố định của mỗi con ngựa. Hệ thống dựa vào đây để tự tạo việc cho ăn
          đúng từng bữa, đúng giờ — và giờ ăn thực tế chính là căn cứ để biết ngựa đã đủ thời gian
          tiêu hóa trước buổi tập hay chưa.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>
          Thêm khẩu phần
        </Button>
      </div>

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={data?.data}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Chưa có khẩu phần nào. Ngựa không có khẩu phần chỉ được tạo 1 việc cho ăn chung mỗi ngày.' }}
      />

      <Modal
        title={editing ? 'Sửa khẩu phần' : 'Thêm khẩu phần'}
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
          onFinish={(values) =>
            saveMutation.mutate({
              id: editing?._id,
              payload: {
                ...values,
                timeOfDay: values.timeOfDay ? dayjs(values.timeOfDay).format('HH:mm') : undefined,
                items: (values.items || [])
                  .map((i) =>
                    i?.inventoryItem && i?.amount
                      ? { inventoryItem: i.inventoryItem, amount: i.amount }
                      : i?.legacyType && i?.legacyQuantity
                        ? { type: i.legacyType, quantity: i.legacyQuantity }
                        : null
                  )
                  .filter(Boolean),
              },
            })
          }
        >
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select
              disabled={Boolean(editing)}
              options={(horsesData?.data || []).map((h) => ({ value: h._id, label: h.name }))}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="mealTime" label="Bữa" rules={[{ required: true }]}>
              <Select
                options={Object.entries(MEAL_LABELS).map(([value, label]) => ({ value, label }))}
                onChange={(v) => form.setFieldValue('timeOfDay', dayjs(DEFAULT_MEAL_TIMES[v], 'HH:mm'))}
              />
            </Form.Item>
            <Form.Item name="timeOfDay" label="Giờ cho ăn" rules={[{ required: true }]}>
              <TimePicker format="HH:mm" minuteStep={15} className="w-full" />
            </Form.Item>
          </div>

          <div className="flex items-center justify-between">
            <Text strong className="!text-sm">
              Các món trong khẩu phần
            </Text>
            <Button size="small" type="link" onClick={() => setProposeOpen(true)}>
              Kho chưa có món cần dùng?
            </Button>
          </div>
          <Text type="secondary" className="block !text-xs mb-2">
            Món lấy từ kho của Quản lý; lượng tính theo đơn vị của mặt hàng. Mỗi bữa nhân viên cho ăn xong, kho tự trừ.
          </Text>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <div>
                {fields.map((field) => (
                  <Form.Item key={field.key} noStyle shouldUpdate>
                    {({ getFieldValue }) => {
                      const row = getFieldValue(['items', field.name]) || {};
                      const item = feedById.get(row.inventoryItem);
                      return (
                        <div className="mb-2">
                          {row.legacyType && !row.inventoryItem && (
                            <Text type="warning" className="block !text-xs">
                              Món cũ: {FEED_TYPE_LABELS[row.legacyType] || row.legacyType} {row.legacyQuantity} — chọn lại từ kho để kho tự trừ.
                            </Text>
                          )}
                          <Space align="baseline" className="!flex">
                            <Form.Item name={[field.name, 'inventoryItem']} className="!mb-0">
                              <Select
                                placeholder="Chọn thức ăn trong kho"
                                style={{ width: 240 }}
                                options={feedItems.map((i) => ({
                                  value: i._id,
                                  label: `${i.name} — còn ${i.quantity} ${i.unit}`,
                                }))}
                              />
                            </Form.Item>
                            <Form.Item name={[field.name, 'amount']} className="!mb-0">
                              <InputNumber min={0} step={0.5} placeholder="Lượng" style={{ width: 110 }} />
                            </Form.Item>
                            <Text type="secondary">{item?.unit || ''}</Text>
                            {fields.length > 1 && (
                              <Button size="small" danger type="text" onClick={() => remove(field.name)}>
                                Xoá
                              </Button>
                            )}
                          </Space>
                          {item && item.quantity < (row.amount || 0) && (
                            <Text type="danger" className="block !text-xs">
                              Kho chỉ còn {item.quantity} {item.unit} — bữa này sẽ không ghi nhận được cho đến khi bổ sung.
                            </Text>
                          )}
                        </div>
                      );
                    }}
                  </Form.Item>
                ))}
                <Button size="small" type="dashed" onClick={() => add()} className="!mt-1">
                  Thêm món
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title="Đề xuất vật tư mới cho Quản lý"
        open={proposeOpen}
        onCancel={() => setProposeOpen(false)}
        onOk={() => proposeForm.submit()}
        okText="Gửi đề xuất"
        cancelText="Huỷ"
        confirmLoading={proposeMutation.isPending}
        destroyOnHidden
      >
        <Form form={proposeForm} layout="vertical" onFinish={(v) => proposeMutation.mutate(v)}>
          <Form.Item name="name" label="Tên thức ăn" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="VD: Cỏ alfalfa" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="quantity" label="Số lượng cần" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="unit" label="Đơn vị" rules={[{ required: true, whitespace: true }]}>
              <Input placeholder="kg, bao, bó…" />
            </Form.Item>
          </div>
          <Form.Item name="note" label="Lý do">
            <Input.TextArea rows={2} placeholder="VD: Khẩu phần mới cho ngựa đang hồi phục" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Incidents                                                                   */
/* -------------------------------------------------------------------------- */

const INCIDENT_FILTERS = [
  { value: 'unresolved', label: 'Chưa xử lý xong' },
  { value: 'resolved', label: 'Đã xử lý' },
  { value: 'all', label: 'Tất cả' },
];

/**
 * What the grooms reported on this trainer's horses and what the vet did about it. Read-only on
 * purpose: answering a report is the vet's call (PATCH /stable/incidents is vet-only). The trainer
 * needs the list because an open report keeps the horse's medical readiness gate amber.
 */
function IncidentsList() {
  const [filter, setFilter] = useState('unresolved');
  const { data, isLoading } = useQuery({
    queryKey: ['incidents', filter],
    queryFn: () => incidentApi.list(filter === 'all' ? {} : { status: filter }),
  });

  const columns = [
    {
      title: 'Báo lúc',
      key: 'reportedAt',
      render: (_, t) => (t.incidentReport?.reportedAt ? dayjs(t.incidentReport.reportedAt).format('DD/MM HH:mm') : '—'),
    },
    {
      title: 'Ngựa',
      key: 'horse',
      render: (_, t) => <Link to={`/horses/${t.horse?._id}`}>{t.horse?.name || 'Ngựa'}</Link>,
    },
    {
      title: 'Mô tả',
      key: 'description',
      render: (_, t) => (
        <div className="min-w-[220px] max-w-md">
          <div>{t.incidentReport?.description}</div>
          {t.incidentReport?.images?.length > 0 && (
            <Text type="secondary" className="!text-xs">
              {t.incidentReport.images.length} ảnh đính kèm
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Mức độ',
      key: 'severity',
      render: (_, t) => {
        const meta = INCIDENT_SEVERITY_META[t.incidentReport?.severity];
        return meta ? <Tag color={meta.color}>{meta.label}</Tag> : '—';
      },
    },
    { title: 'Người báo', key: 'reporter', render: (_, t) => t.assignedTo?.name || '—' },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, t) => {
        const meta = INCIDENT_STATUS_META[incidentStatusOf(t.incidentReport)];
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: 'Bác sĩ phản hồi',
      key: 'response',
      render: (_, t) => {
        const r = t.incidentReport || {};
        if (!r.response) return <span className="text-gray-400">—</span>;
        return (
          <div className="min-w-[200px] max-w-sm text-sm">
            {r.handledBy?.name ? `${r.handledBy.name}: ` : ''}
            {r.response}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <Typography.Text type="secondary" className="text-sm max-w-3xl">
          Sự cố nhân viên chăm sóc báo trên các ngựa bạn phụ trách. Bác sĩ tiếp nhận và kết luận; sự cố
          chưa xử lý xong làm cửa y tế của buổi tập chuyển vàng.
        </Typography.Text>
        <Segmented options={INCIDENT_FILTERS} value={filter} onChange={setFilter} />
      </div>
      <Table
        rowKey="_id"
        columns={columns}
        dataSource={data?.data}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: filter === 'unresolved' ? 'Không có sự cố nào đang chờ xử lý.' : 'Chưa có sự cố nào.' }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export default function StableAssignPage() {
  return (
    <div>
      <div className="mb-3">
        <Title level={3} className="!mb-0">
          Chuồng trại &amp; Chăm sóc
        </Title>
        <Typography.Text type="secondary" className="text-sm">
          Điều phối công việc chăm sóc và khẩu phần ăn — hai thứ quyết định con ngựa có ở thể trạng
          tốt nhất vào giờ tập hay không.
        </Typography.Text>
      </div>

      <Tabs
        items={[
          { key: 'tasks', label: 'Công việc chăm sóc', children: <TaskList /> },
          { key: 'rations', label: 'Khẩu phần ăn', children: <RationList /> },
          { key: 'incidents', label: 'Sự cố chuồng trại', children: <IncidentsList /> },
        ]}
      />
    </div>
  );
}
