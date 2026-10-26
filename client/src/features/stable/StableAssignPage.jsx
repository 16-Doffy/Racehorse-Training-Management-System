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
  Alert,
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
  ProfileOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { dailyTaskApi, incidentApi, stallApi, stableAssignmentApi } from './stableApi';
import { breakfastBy } from './rationSuggestion';
import { trainingPlanApi } from '../training/trainingApi';
import { PHASE_LABELS } from '../training/trainingVocab';
import { horsesApi } from '../horses/horsesApi';
import { usersApi } from '../admin/usersApi';
import { feedingApi } from '../feeding/feedingApi';
import FeedingCalendarPanel from './FeedingCalendarPanel';
import FeedingTimetable from './FeedingTimetable';
import CareHorseList from './CareHorseList';
import RationHorseList from './RationHorseList';
import { useClubPolicy } from '../training/useClubPolicy';
import { inventoryApi } from '../inventory/inventoryApi';
import PageHeroBanner from '../../components/common/PageHeroBanner';
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
import { newestFirst } from '../../utils/newestFirst';

const { Text } = Typography;
const STATUS_LABELS = { pending: 'Chưa thực hiện', completed: 'Đã hoàn thành', skipped: 'Đã bỏ qua' };
const STATUS_COLORS = { pending: 'default', completed: 'green', skipped: 'orange' };
const SEVERITY_LABELS = { low: 'Nhẹ', medium: 'Trung bình', high: 'Nghiêm trọng' };
const SEVERITY_COLORS = { low: 'gold', medium: 'orange', high: 'red' };
const MEAL_LABELS = { morning: 'Bữa sáng', noon: 'Bữa trưa', evening: 'Bữa chiều' };
const DEFAULT_MEAL_TIMES = { morning: '06:00', noon: '11:30', evening: '17:30' };
// The suggested ration (server rationRules.js): the work it is set for, and what each meal is for.
const WORK_LABELS = { rest: 'ngày không tập', light: 'ngày tập nhẹ', moderate: 'ngày tập vừa', high: 'ngày tập nặng' };
const MEAL_ROLES = {
  morning: 'Trước giờ tập: chủ yếu cỏ, ít thức ăn tinh để kịp tiêu hóa.',
  noon: 'Bữa phụ, nhẹ.',
  evening: 'Bữa chính trong ngày (sau giờ tập, cho cả đêm dài), kèm chất bổ sung.',
};
const amountText = (n) => Number(n).toLocaleString('vi-VN');

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

/**
 * A notification opens this page on one horse (?horse=<id>): each list shows that horse's rows only,
 * with a tag to see everything again. On the care tab, picking a horse in the list does the same.
 */
function useHorseFocus() {
  const [params, setParams] = useSearchParams();
  const horse = params.get('horse');
  const clear = () => {
    const next = new URLSearchParams(params);
    next.delete('horse');
    setParams(next, { replace: true });
  };
  const select = (id) => {
    const next = new URLSearchParams(params);
    next.set('horse', id);
    setParams(next);
  };
  return { horse, clear, select };
}
const horseIdOf = (row) => String(row?.horse?._id || row?.horse || '');
const ofHorse = (rows, horse) => (horse ? (rows || []).filter((r) => horseIdOf(r) === horse) : rows);
/**
 * The horse being looked at on its own, and the way back to every horse. It stays at the top of the
 * page while the timetable and the rations scroll under it.
 */
function HorseFocusTag({ focus, rows }) {
  if (!focus.horse) return null;
  const name = (rows || []).find((r) => horseIdOf(r) === focus.horse && r.horse?.name)?.horse?.name || 'ngựa được chọn';
  return (
    <div className="light-surface-box sticky top-0 z-10 mb-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border border-[#D4AF37]/40 bg-[#FAF7F0] px-3.5 py-2 shadow-2xs">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-xs text-gray-500">Đang xem riêng:</span>
        <span className="text-sm font-semibold text-gray-900">{name}</span>
      </div>
      <Button size="small" icon={<CloseOutlined />} onClick={focus.clear}>
        Xem tất cả ngựa
      </Button>
    </div>
  );
}

function TaskList() {
  const focus = useHorseFocus();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const formTaskType = Form.useWatch('taskType', form);
  const queryClient = useQueryClient();

  // Refreshed every minute: the grooms tick their meals and jobs off from the app.
  const { data, isLoading } = useQuery({ queryKey: ['daily-tasks-all'], queryFn: () => dailyTaskApi.list(), refetchInterval: 60 * 1000 });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: groomsData } = useQuery({
    queryKey: ['users', ROLES.GROOM],
    queryFn: () => usersApi.list({ role: ROLES.GROOM }),
  });
  // Where each horse stands and who looks after that stall: a job for a horse goes to that groom unless
  // the trainer picks someone else (the feeds, care orders and post-session care already do).
  const { data: stallsData } = useQuery({ queryKey: ['stalls'], queryFn: () => stallApi.map() });
  const stallOfHorse = new Map([
    ...(stallsData?.data?.unplaced || []).map((u) => [String(u.horse?._id), { code: u.stableBlock, caretaker: u.caretaker }]),
    ...(stallsData?.data?.stalls || [])
      .filter((s) => s.occupant?.horse)
      .map((s) => [String(s.occupant.horse._id), { code: s.code, caretaker: s.occupant.caretaker || s.caretaker }]),
  ]);
  const pickedHorseStall = stallOfHorse.get(String(Form.useWatch('horse', form) || ''));

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
            dueTime: record.dueTime ? dayjs().hour(Number(record.dueTime.slice(0, 2))).minute(Number(record.dueTime.slice(3, 5))).second(0) : null,
            note: record.note,
          }
        : // Next full hour: a job given now is for later today, not for the minute it was typed.
          { scheduledDate: dayjs(), dueTime: dayjs().add(1, 'hour').startOf('hour') }
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
            {r.dueTime && r.taskType === 'medication' && (
              <Tag color="purple" icon={<MedicineBoxOutlined />}>
                {r.dueTime}
              </Tag>
            )}
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
      // When the job is due: the meal's time, the dose's or job's hour. A job without an hour
      // (given before hours existed) is for the whole day — it never showed the time it was typed.
      render: (d, r) =>
        r.mealSlot || r.dueTime ? (
          <span className="whitespace-nowrap tabular-nums">
            <b>{r.dueTime || dayjs(d).format('HH:mm')}</b> {dayjs(d).format('DD/MM')}
          </span>
        ) : (
          <span className="whitespace-nowrap tabular-nums">
            {dayjs(d).format('DD/MM')} <Text type="secondary">· cả ngày</Text>
          </span>
        ),
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
          {/* Who did it and when: the person who ticked it, not only who it was given to. */}
          {r.status === 'completed' && r.completedAt && (
            <Text type="secondary" className="basis-full !text-xs">
              {(r.completedBy || r.assignedTo)?.name || 'Nhân viên'} {r.taskType === 'feeding' ? 'cho ăn' : 'làm'} lúc {dayjs(r.completedAt).format('HH:mm')}
            </Text>
          )}
          {r.status === 'skipped' && r.skippedBy?.name && (
            <Text type="secondary" className="basis-full !text-xs">
              {r.skippedBy.name} báo lúc {dayjs(r.receivedAt || r.updatedAt).format('HH:mm')}
            </Text>
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
          Bữa ăn tự tạo theo khẩu phần và lịch cho ăn đã xác nhận (tab Khẩu phần ăn); việc sau buổi tập nặng tự sinh khi kết
          thúc buổi; y lệnh do bác sĩ chỉ định. Bạn chỉ cần giao thêm việc phát sinh. Bữa ăn được ghi nhận ảnh hưởng tới điều kiện
          xếp lịch tập.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>
          Giao việc phát sinh
        </Button>
      </div>

      {focus.horse ? (
        // One horse: its feeding week, meal by meal, then all its jobs.
        <div className="flex flex-col gap-4">
          <div>
            <HorseFocusTag focus={focus} rows={[...(data?.data || []), ...(horsesData?.data || []).map((h) => ({ horse: h }))]} />
          </div>
          <FeedingTimetable horseId={focus.horse} />
          <div>
            <Text strong className="!text-sm">
              Các việc của ngựa này
            </Text>
            <Table
              className="mt-2"
              rowKey="_id"
              columns={columns.filter((c) => !focus.horse || c.key !== 'horse')}
              dataSource={newestFirst(ofHorse(data?.data, focus.horse))}
              loading={isLoading}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'Ngựa này chưa có công việc nào. Bữa ăn tự xuất hiện khi ngựa đã được xếp chuồng và có người chăm sóc.' }}
            />
          </div>
        </div>
      ) : (
        <>
          <Text type="secondary" className="block !text-xs mb-2">
            Bấm vào một ngựa để xem thời khóa biểu cho ăn trong tuần (đã cho ăn hay chưa, ai cho, lúc nào) và các việc của nó.
          </Text>
          <CareHorseList tasks={data?.data} horses={horsesData?.data || []} stallOfHorse={stallOfHorse} onSelect={focus.select} loading={isLoading} />
        </>
      )}

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
              payload: { ...values, scheduledDate: values.scheduledDate?.toISOString(), dueTime: values.dueTime ? values.dueTime.format('HH:mm') : undefined }
            })
          }
        >
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select
              options={(horsesData?.data || []).map((h) => ({ value: h._id, label: h.name }))}
              onChange={(id) => {
                const groom = stallOfHorse.get(String(id))?.caretaker?._id;
                if (groom) form.setFieldValue('assignedTo', groom);
              }}
            />
          </Form.Item>
          <Form.Item
            name="assignedTo"
            label="Nhân viên chăm sóc"
            rules={[{ required: true }]}
            extra={
              pickedHorseStall?.caretaker?.name
                ? `Mặc định là người chăm sóc chuồng ${pickedHorseStall.code}: ${pickedHorseStall.caretaker.name}.`
                : pickedHorseStall
                  ? `Chuồng ${pickedHorseStall.code} chưa có người chăm sóc — chọn người làm việc này.`
                  : undefined
            }
          >
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
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="scheduledDate" label="Ngày thực hiện" rules={[{ required: true }]}>
              <DatePicker
                className="w-full"
                format="DD/MM/YYYY"
                // Work is handed out for today or later; a meal's day is fixed by its ration.
                disabled={editing?.taskType === 'feeding'}
                disabledDate={(d) => d && d < dayjs().startOf('day')}
              />
            </Form.Item>
            {formTaskType === 'feeding' ? (
              <Form.Item label="Giờ thực hiện" extra="Giờ của bữa theo khẩu phần.">
                <Input disabled value={editing?.scheduledDate ? dayjs(editing.scheduledDate).format('HH:mm') : ''} />
              </Form.Item>
            ) : (
              <Form.Item
                name="dueTime"
                label="Giờ thực hiện"
                rules={[{ required: true, message: 'Chọn giờ thực hiện' }]}
                extra="Nhân viên ghi nhận được từ 1 tiếng trước giờ này."
              >
                <TimePicker className="w-full" format="HH:mm" minuteStep={15} needConfirm={false} />
              </Form.Item>
            )}
          </div>
          <Form.Item
            name="note"
            label={formTaskType === 'other' ? 'Nội dung công việc' : 'Dặn dò cho nhân viên'}
            rules={formTaskType === 'other' ? [{ required: true, message: 'Ghi rõ công việc cần làm' }] : []}
            extra="Hiện ngay trên việc của họ."
          >
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
  const focus = useHorseFocus();
  const policy = useClubPolicy();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['feeding'], queryFn: () => feedingApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  // Ration items come from the Manager's stock list (food only), with what is in stock now.
  const { data: inventoryData } = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const feedItems = (inventoryData?.data || []).filter((i) => i.category === 'feed' && !i.isProposed && i.isActive !== false);
  const feedById = new Map(feedItems.map((i) => [i._id, i]));
  // Who feeds each horse (its stall's groom), what happened to each meal today, and the plan the
  // suggested ration is worked out from.
  const { data: assignmentsData } = useQuery({ queryKey: ['stable-assignments'], queryFn: () => stableAssignmentApi.list() });
  const { data: tasksData } = useQuery({ queryKey: ['daily-tasks-all'], queryFn: () => dailyTaskApi.list() });
  const { data: plansData } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const idOf = (ref) => String(ref?._id || ref || '');
  const assignmentOf = (horse) => (assignmentsData?.data || []).find((a) => idOf(a.horse) === idOf(horse));
  const planOf = (horse) => (plansData?.data || []).find((p) => p.status === 'active' && idOf(p.horse) === idOf(horse));
  const todayMeal = (ration) => {
    const meals = (tasksData?.data || []).filter(
      (t) => t.taskType === 'feeding' && idOf(t.horse) === idOf(ration.horse) && t.mealSlot === ration.mealTime && dayjs(t.scheduledDate).isSame(dayjs(), 'day')
    );
    return meals.find((t) => t.status === 'completed') || meals.find((t) => !t.makeUpOf) || null;
  };
  const watchedHorse = Form.useWatch('horse', form);
  const watchedSlot = Form.useWatch('mealTime', form);
  const formHorse = (horsesData?.data || []).find((h) => h._id === watchedHorse);
  const formGroom = watchedHorse ? assignmentOf(watchedHorse) : null;
  const formPlan = watchedHorse ? planOf(watchedHorse) : null;
  // Worked out on the server from the plan's phase, the horse's weight and the whole stock.
  const { data: suggestData } = useQuery({
    queryKey: ['feeding-suggest', watchedHorse, watchedSlot],
    queryFn: () => feedingApi.suggest(watchedHorse, watchedSlot),
    enabled: open && Boolean(formHorse) && Boolean(watchedSlot),
  });
  const suggestion = open && formHorse ? suggestData?.data : null;
  const morningBy = formPlan && watchedSlot === 'morning' ? breakfastBy(formPlan.sessionTime || policy.morningTime, policy.digestMinutes) : null;
  const applySuggestion = () => {
    const lines = suggestion.items.map((i) => ({ inventoryItem: i.inventoryItem, amount: i.amount }));
    if (lines.length) form.setFieldValue('items', lines);
    const time = form.getFieldValue('timeOfDay');
    if (morningBy && time && dayjs(time).format('HH:mm') > morningBy) form.setFieldValue('timeOfDay', dayjs(morningBy, 'HH:mm'));
  };
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

  const deleteRation = useMutation({
    mutationFn: (id) => feedingApi.remove(id),
    onSuccess: (res) => {
      const removed = res?.data?.removedTasks || 0;
      message.success(removed ? `Đã xoá khẩu phần và ${removed} việc cho ăn chưa làm của bữa đó hôm nay.` : 'Đã xoá khẩu phần.');
      invalidate();
    },
    onError: (err) => message.error(err.message || 'Xoá khẩu phần thất bại.'),
  });

  const openModal = (record) => {
    const isEdit = Boolean(record?._id);
    setEditing(isEdit ? record : null);
    form.setFieldsValue(
      record
        ? {
            horse: record.horse?._id || record.horse || focus.horse || undefined,
            mealTime: record.mealTime || 'morning',
            timeOfDay: dayjs(record.timeOfDay || DEFAULT_MEAL_TIMES[record.mealTime || 'morning'], 'HH:mm'),
            // Linked items load as stock item + amount; older text items are kept and shown so
            // the trainer can re-pick them from stock.
            items: record.items?.length
              ? record.items.map((i) =>
                  i.inventoryItem ? { inventoryItem: i.inventoryItem._id || i.inventoryItem, amount: i.amount } : { legacyType: i.type, legacyQuantity: i.quantity }
                )
              : [{}],
          }
        : { horse: focus.horse || undefined, mealTime: 'morning', timeOfDay: dayjs(DEFAULT_MEAL_TIMES.morning, 'HH:mm'), items: [{}] }
    );
    setOpen(true);
  };

  const columns = [
    {
      title: 'Ngựa',
      dataIndex: ['horse', 'name'],
      key: 'horse',
      // The name opens the horse's feeding timetable on this tab; the icon opens its profile.
      render: (name, r) => (
        <span className="inline-flex items-center gap-2">
          <Button type="link" className="!h-auto !p-0" onClick={() => focus.select(horseIdOf(r))}>
            {name}
          </Button>
          <Tooltip title="Hồ sơ ngựa">
            <Link to={`/horses/${horseIdOf(r)}`} aria-label={`Hồ sơ ${name}`} className="text-gray-400 hover:text-emerald-700">
              <ProfileOutlined />
            </Link>
          </Tooltip>
        </span>
      ),
    },
    {
      // The groom who feeds the horse, and what became of this meal today.
      title: 'Người cho ăn',
      key: 'groom',
      render: (_, r) => {
        const groom = assignmentOf(r.horse)?.assignedCaretaker;
        const t = todayMeal(r);
        let today = null;
        if (t?.status === 'completed') today = { type: 'success', text: `Hôm nay: ${(t.completedBy || t.assignedTo)?.name || 'nhân viên'} cho ăn lúc ${dayjs(t.completedAt).format('HH:mm')}` };
        else if (t?.status === 'skipped') today = { type: 'danger', text: t.skipReason ? `Hôm nay: không cho ăn được (${t.skipReason})` : 'Hôm nay: HLV cho bỏ bữa' };
        else if (t?.timing?.state === 'missed') today = { type: 'danger', text: 'Hôm nay: chưa cho ăn, đã quá giờ' };
        else if (t) today = { type: 'secondary', text: 'Hôm nay: chưa cho ăn' };
        return (
          <div className="flex flex-col min-w-[180px] text-sm">
            {groom?.name ? <span>{groom.name}</span> : <Text type="warning">Chưa có nhân viên chăm sóc</Text>}
            {today && (
              <Text type={today.type} className="!text-xs">
                {today.text}
              </Text>
            )}
          </div>
        );
      },
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
      render: (_, r) => {
        const unlinked = (r.items || []).some((i) => !i.inventoryItem);
        return (
          <div className="flex flex-col items-start gap-1">
            {r.approvedBy && r.items?.length ? (
              <Tag color="green" className="!m-0">Đã duyệt — {r.approvedBy.name}</Tag>
            ) : (
              <Tooltip title="Groom không ghi nhận được bữa này cho tới khi khẩu phần có món và được duyệt. Bấm Sửa rồi Lưu để duyệt.">
                <Tag color="red" className="!m-0">Chưa duyệt — Groom chưa ghi nhận được</Tag>
              </Tooltip>
            )}
            {unlinked && (
              <Tooltip title="Món ghi bằng chữ không trừ kho. Bấm Sửa, chọn lại món từ kho rồi Lưu.">
                <Tag color="orange" className="!m-0">Có món chưa gắn kho</Tag>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>
            Sửa
          </Button>
          <Popconfirm
            title="Xoá khẩu phần này?"
            description="Việc cho ăn chưa làm của bữa này hôm nay cũng được bỏ; lịch sử giữ nguyên. Ngựa không còn bữa nào thì nhân viên sẽ báo HLV."
            okText="Xoá"
            okButtonProps={{ danger: true }}
            cancelText="Không"
            onConfirm={() => deleteRation.mutate(r._id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={deleteRation.isPending && deleteRation.variables === r._id} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {focus.horse ? (
        // One horse picked: its feeding week first, meal by meal, then its plan calendar, then standing rations.
        <div className="flex flex-col gap-4">
          <div>
            <HorseFocusTag focus={focus} rows={[...(data?.data || []), ...(horsesData?.data || []).map((h) => ({ horse: h }))]} />
          </div>
          <FeedingTimetable horseId={focus.horse} />
          <FeedingCalendarPanel plans={plansData?.data || []} horseId={focus.horse} feedItems={feedItems} />
          <div>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="!m-0 !text-[15px] font-semibold">Khẩu phần mẫu của ngựa này</h3>
                <Typography.Text type="secondary" className="!text-xs">
                  Cho những ngày không có lịch ăn theo kế hoạch tập.
                </Typography.Text>
              </div>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal({ horse: focus.horse })}>
                Thêm khẩu phần
              </Button>
            </div>

            <Table
              rowKey="_id"
              columns={columns.filter((c) => !focus.horse || c.key !== 'horse')}
              dataSource={newestFirst(ofHorse(data?.data, focus.horse))}
              loading={isLoading}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'Ngựa này chưa có khẩu phần mẫu nào.' }}
            />
          </div>
        </div>
      ) : (
        // Overview of all horses: how many horses, each horse's feed status, standing rations, warnings. Click to open details.
        <>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
            <Typography.Text type="secondary" className="text-sm max-w-3xl">
              Mỗi chiến mã có lịch ăn riêng theo kế hoạch tập và khẩu phần mẫu. Bấm vào một ngựa để xem chi tiết lịch từng ngày,
              thời khóa biểu tuần và quản lý khẩu phần.
            </Typography.Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>
              Thêm khẩu phần
            </Button>
          </div>
          <RationHorseList
            rations={data?.data || []}
            horses={horsesData?.data || []}
            tasks={tasksData?.data || []}
            assignmentOf={assignmentOf}
            planOf={planOf}
            onSelect={focus.select}
            loading={isLoading}
          />
        </>
      )}

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
                items: (values.items || []).filter((i) => i?.inventoryItem && i?.amount).map((i) => ({ inventoryItem: i.inventoryItem, amount: i.amount })),
              },
            })
          }
        >
          <Form.Item
            name="horse"
            label="Ngựa"
            rules={[{ required: true }]}
            extra={
              watchedHorse &&
              (formGroom?.assignedCaretaker?.name ? (
                <span>
                  Nhân viên cho ăn: <b>{formGroom.assignedCaretaker.name}</b>
                  {formGroom.stall?.code ? ` · chuồng ${formGroom.stall.code}` : ''}
                </span>
              ) : (
                <Text type="warning">Ngựa chưa có nhân viên chăm sóc: Quản lý cần xếp chuồng thì mới có người cho ăn.</Text>
              ))
            }
          >
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
            <Form.Item
              name="timeOfDay"
              label="Giờ cho ăn"
              rules={[{ required: true }]}
              extra={`Bữa sáng trước 11:00 · bữa trưa 11:00–15:59 · bữa chiều từ 16:00; hai bữa cách nhau ít nhất ${policy.mealMinGapHours} giờ (quy định CLB).`}
            >
              <TimePicker format="HH:mm" minuteStep={15} className="w-full" />
            </Form.Item>
          </div>

          {suggestion && (
            <Alert
              type="info"
              className="!mb-3"
              title={`Gợi ý ${(MEAL_LABELS[watchedSlot] || 'bữa này').toLowerCase()} theo kế hoạch tập`}
              description={
                <div className="flex flex-col gap-1 text-sm">
                  <span>
                    {suggestion.phase ? `Giai đoạn ${PHASE_LABELS[suggestion.phase] || suggestion.phase} · ${WORK_LABELS[suggestion.work]}` : 'Ngựa chưa có kế hoạch tập: khẩu phần duy trì'}
                    {suggestion.weightKg ? ` · nặng ${suggestion.weightKg} kg` : ''}.
                  </span>
                  {suggestion.warning && <Text type="warning">{suggestion.warning}</Text>}
                  <span>{watchedSlot === 'morning' && suggestion.work === 'rest' ? 'Ngày không tập: thức ăn tinh chia đều hơn giữa các bữa.' : MEAL_ROLES[watchedSlot]}</span>
                  <span>
                    Cả ngày khoảng {amountText(suggestion.daily.forage)} kg cỏ và {amountText(suggestion.daily.concentrate)} kg thức ăn tinh. Bữa này:{' '}
                    <b>{suggestion.items.length ? suggestion.items.map((i) => `${amountText(i.amount)} ${i.unit} ${i.name}`).join(' + ') : 'kho chưa có cỏ hay thức ăn tinh tính theo kg'}</b>.
                  </span>
                  {morningBy && (
                    <span>
                      Buổi tập sáng {formPlan.sessionTime || policy.morningTime}: cho ăn sáng xong trước {morningBy} để đủ {policy.digestMinutes} phút tiêu hóa.
                    </span>
                  )}
                  <Text type="secondary" className="!text-xs">
                    Căn cứ: cả ngày 2–2,5% cân nặng; cỏ không dưới 1,5%; thức ăn tinh tăng theo mức tập và không quá 0,5% cân nặng mỗi bữa (NRC
                    2007). Khoáng mỗi ngày, dầu ở giai đoạn sức mạnh và tốc độ, điện giải ngày tập nặng. Món: món ngựa đang ăn, nếu không thì món đủ
                    dùng cả tuần, hết hạn sớm nhất trước. Ngày nghỉ ít thức ăn tinh hơn: xem lịch cho ăn theo kế hoạch tập.
                  </Text>
                  {suggestion.items.length > 0 && (
                    <Button size="small" className="!self-start !mt-1" onClick={applySuggestion}>
                      Dùng gợi ý cho bữa này
                    </Button>
                  )}
                </div>
              }
            />
          )}

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
                              Món cũ: {FEED_TYPE_LABELS[row.legacyType] || row.legacyType} {row.legacyQuantity} — chọn lại từ kho (bắt buộc) hoặc xoá dòng này.
                            </Text>
                          )}
                          <Space align="baseline" className="!flex">
                            <Form.Item name={[field.name, 'inventoryItem']} className="!mb-0" rules={[{ required: true, message: 'Chọn món trong kho' }]}>
                              <Select
                                placeholder="Chọn thức ăn trong kho"
                                style={{ width: 240 }}
                                options={feedItems.map((i) => ({
                                  value: i._id,
                                  label: `${i.name} — còn ${i.quantity} ${i.unit}`,
                                }))}
                              />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, 'amount']}
                              className="!mb-0"
                              rules={[{ required: true, message: 'Nhập lượng' }, { type: 'number', min: 0.01, message: 'Lượng phải lớn hơn 0' }]}
                            >
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
  const focus = useHorseFocus();
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
      <HorseFocusTag focus={focus} rows={data?.data} />
      <Table
        rowKey="_id"
        columns={columns.filter((c) => !focus.horse || c.key !== 'horse')}
        dataSource={newestFirst(ofHorse(data?.data, focus.horse))}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: filter === 'unresolved' ? 'Không có sự cố nào đang chờ xử lý.' : 'Chưa có sự cố nào.' }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export default function StableAssignPage() {
  const [params, setParams] = useSearchParams();
  const tab = ['tasks', 'rations', 'incidents'].includes(params.get('tab')) ? params.get('tab') : 'tasks';
  return (
    <div>
      <PageHeroBanner
        eyebrow="TEAM 8 • CHUỒNG TRẠI & CHĂM SÓC"
        roleLabel="Head Trainer"
        title="Chuồng trại, chăm sóc & khẩu phần ăn"
        subtitle="Điều phối công việc chăm sóc hàng ngày, khẩu phần dinh dưỡng và sự cố chuồng trại đảm bảo thể trạng tốt nhất cho chiến mã."
      />

      <Tabs
        activeKey={tab}
        onChange={(key) => setParams({ tab: key }, { replace: true })}
        destroyOnHidden
        items={[
          { key: 'tasks', label: 'Công việc chăm sóc', children: <TaskList /> },
          { key: 'rations', label: 'Khẩu phần ăn', children: <RationList /> },
          { key: 'incidents', label: 'Sự cố chuồng trại', children: <IncidentsList /> },
        ]}
      />
    </div>
  );
}
