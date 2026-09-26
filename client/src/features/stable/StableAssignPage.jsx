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
} from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, WarningFilled, RobotOutlined, EditOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { dailyTaskApi } from './stableApi';
import { horsesApi } from '../horses/horsesApi';
import { usersApi } from '../admin/usersApi';
import { feedingApi } from '../feeding/feedingApi';
import { ROLES } from '../../constants/roles';

const { Title, Text } = Typography;
const TASK_LABELS = { feeding: 'Cho ăn', cleaning: 'Vệ sinh chuồng', bathing: 'Tắm rửa', icing: 'Ngâm chân nước đá' };
const STATUS_LABELS = { pending: 'Chưa thực hiện', completed: 'Đã hoàn thành', skipped: 'Đã bỏ qua' };
const STATUS_COLORS = { pending: 'default', completed: 'green', skipped: 'orange' };
const SEVERITY_LABELS = { low: 'Nhẹ', medium: 'Trung bình', high: 'Nghiêm trọng' };
const SEVERITY_COLORS = { low: 'gold', medium: 'orange', high: 'red' };
const MEAL_LABELS = { morning: 'Bữa sáng', noon: 'Bữa trưa', evening: 'Bữa chiều' };
const DEFAULT_MEAL_TIMES = { morning: '06:00', noon: '11:30', evening: '17:30' };
const APPETITE_LABELS = { full: 'Ăn hết', partial: 'Ăn dở', refused: 'Bỏ ăn' };
const APPETITE_COLORS = { full: 'green', partial: 'gold', refused: 'red' };

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
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['daily-tasks-all'], queryFn: () => dailyTaskApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: groomsData } = useQuery({
    queryKey: ['users', ROLES.GROOM],
    queryFn: () => usersApi.list({ role: ROLES.GROOM }),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => dailyTaskApi.create(payload),
    onSuccess: () => {
      message.success('Đã phân công công việc.');
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
      setOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Phân công thất bại.'),
  });

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
        <div>
          <Tag color={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status] || r.status}</Tag>
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
              </div>
            }
          >
            <Tag color="red" icon={<WarningFilled />} className="cursor-pointer">
              Có sự cố
            </Tag>
          </Popover>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <Typography.Text type="secondary" className="text-sm max-w-3xl">
          Việc cho ăn được tự động tạo theo khẩu phần đã duyệt (xem tab bên cạnh), và việc chăm sóc
          sau buổi tập nặng — ngâm chân, tắm — cũng tự sinh khi bạn kết thúc buổi tập. Bạn chỉ cần
          giao thêm những việc phát sinh. Ghi nhận của nhân viên về việc ăn uống sẽ quay lại ảnh
          hưởng tới điều kiện xếp lịch tập.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
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
        title="Giao việc phát sinh"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            createMutation.mutate({ ...values, scheduledDate: values.scheduledDate?.toISOString() })
          }
        >
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select options={(horsesData?.data || []).map((h) => ({ value: h._id, label: h.name }))} />
          </Form.Item>
          <Form.Item name="assignedTo" label="Nhân viên chăm sóc" rules={[{ required: true }]}>
            <Select options={(groomsData?.data || []).map((u) => ({ value: u._id, label: u.name }))} />
          </Form.Item>
          <Form.Item name="taskType" label="Loại công việc" rules={[{ required: true }]}>
            <Select options={Object.entries(TASK_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="scheduledDate" label="Ngày thực hiện" rules={[{ required: true }]}>
            <DatePicker className="w-full" />
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['feeding'] });

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }) => (id ? feedingApi.update(id, payload) : feedingApi.create(payload)),
    onSuccess: () => {
      message.success(editing ? 'Đã cập nhật khẩu phần.' : 'Đã tạo khẩu phần.');
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
            items: record.items?.length ? record.items : [{}],
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
          <span className="text-sm">
            {r.items.map((i) => `${FEED_TYPE_LABELS[i.type] || i.type} ${i.quantity}`).join(' · ')}
          </span>
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
                items: (values.items || []).filter((i) => i?.type && i?.quantity),
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

          <Text strong className="!text-sm">
            Các món trong khẩu phần
          </Text>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <div className="mt-2">
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" className="!flex !mb-1">
                    <Form.Item name={[field.name, 'type']} className="!mb-0">
                      <Select placeholder="Loại thức ăn" options={FEED_TYPE_OPTIONS} style={{ width: 170 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'quantity']} className="!mb-0">
                      <Input placeholder="VD: 2kg" style={{ width: 110 }} />
                    </Form.Item>
                    {fields.length > 1 && (
                      <Button size="small" danger type="text" onClick={() => remove(field.name)}>
                        Xoá
                      </Button>
                    )}
                  </Space>
                ))}
                <Button size="small" type="dashed" onClick={() => add()} className="!mt-1">
                  Thêm món
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
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
        ]}
      />
    </div>
  );
}
