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
  CloseOutlined,
} from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { careRoutineApi, dailyTaskApi, incidentApi, stallApi, stableAssignmentApi } from './stableApi';
import CareRoutineList from './CareRoutineList';
import CareRoutineModal from './CareRoutineModal';
import { trainingPlanApi } from '../training/trainingApi';
import { horsesApi } from '../horses/horsesApi';
import { usersApi } from '../admin/usersApi';
import { feedingApi } from '../feeding/feedingApi';
import FeedingTimetable from './FeedingTimetable';
import CareHorseList from './CareHorseList';
import RationHorseList from './RationHorseList';
import RationPlanner from './RationPlanner';
import HorseFeedingView from './HorseFeedingView';
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
  // Jobs handed out for many days, and the plans that say how long a horse is in training.
  const { data: routinesData, isLoading: routinesLoading } = useQuery({ queryKey: ['care-routines'], queryFn: () => careRoutineApi.list() });
  const { data: plansData } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const [routineModal, setRoutineModal] = useState({ open: false, routine: null });
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
            {r.routine && (
              // One time of a job handed out for many days (Giao việc chăm sóc).
              <Tooltip title="Việc giao dài hạn: tự hiện mỗi ngày theo lịch đã giao">
                <Tag color="cyan">Việc dài hạn{r.durationMinutes ? ` · ${r.durationMinutes} phút` : ''}</Tag>
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
        // A day of a long-running job: it changes with the job; only this one time can be called off.
        if (r.routine) {
          return (
            <Popconfirm
              title="Bỏ lần làm này?"
              description="Chỉ bỏ lần này; việc giao dài hạn vẫn tiếp tục các lần sau."
              onConfirm={() => skipMutation.mutate(r._id)}
              okText="Bỏ lần này"
              cancelText="Huỷ"
            >
              <Button size="small" icon={<StopOutlined />} loading={skipMutation.isPending && skipMutation.variables === r._id}>
                Bỏ lần này
              </Button>
            </Popconfirm>
          );
        }
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

  // Meals, post-work care and the vet's orders make themselves; the trainer hands out the rest, for as
  // many days as it is needed (a care routine), not one day at a time.
  const addJob = (
    <Tooltip title="Giao một việc cho nhân viên chăm sóc làm nhiều ngày: mỗi ngày mấy lần, giờ nào, mỗi lần bao lâu, làm thế nào. Bữa ăn, việc sau buổi tập và y lệnh bác sĩ tự tạo.">
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setRoutineModal({ open: true, routine: null })}>
        Giao việc chăm sóc
      </Button>
    </Tooltip>
  );
  const routineList = (rows, showHorse) => (
    <CareRoutineList
      routines={rows}
      loading={routinesLoading}
      showHorse={showHorse}
      stallOfHorse={stallOfHorse}
      onEdit={(routine) => setRoutineModal({ open: true, routine })}
    />
  );

  return (
    <div>
      {focus.horse ? (
        // One horse: its feeding week, meal by meal, then the jobs handed out for it, then all its tasks.
        <div className="flex flex-col gap-4">
          <div>
            <HorseFocusTag focus={focus} rows={[...(data?.data || []), ...(horsesData?.data || []).map((h) => ({ horse: h }))]} />
          </div>
          <FeedingTimetable horseId={focus.horse} />
          <div className="flex justify-end">{addJob}</div>
          {routineList(ofHorse(routinesData?.data, focus.horse), false)}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text strong className="!text-sm">
                Các việc của ngựa này
              </Text>
            </div>
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
        <div className="flex flex-col gap-6">
          <CareHorseList tasks={data?.data} horses={horsesData?.data || []} stallOfHorse={stallOfHorse} onSelect={focus.select} loading={isLoading} action={addJob} />
          {routineList(routinesData?.data || [], true)}
        </div>
      )}

      {routineModal.open && (
        <CareRoutineModal
          open
          routine={routineModal.routine}
          horseId={focus.horse}
          horses={horsesData?.data || []}
          grooms={groomsData?.data || []}
          stallOfHorse={stallOfHorse}
          planOf={(horse) => (plansData?.data || []).find((p) => p.status === 'active' && String(p.horse?._id || p.horse) === String(horse._id))}
          onClose={() => setRoutineModal({ open: false, routine: null })}
        />
      )}

      <Modal
        title="Sửa công việc"
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
  const queryClient = useQueryClient();
  // The ration planner: open on a horse (its page, a notification) or on none (the overview).
  const [planner, setPlanner] = useState({ open: false, horseId: null });
  const openPlanner = (horseId) => setPlanner({ open: true, horseId: horseId || null });

  const { data, isLoading } = useQuery({ queryKey: ['feeding'], queryFn: () => feedingApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  // Ration items come from the Manager's stock list (food only), with what is in stock now.
  const { data: inventoryData } = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const feedItems = (inventoryData?.data || []).filter((i) => i.category === 'feed' && !i.isProposed && i.isActive !== false);
  // Who feeds each horse (its stall's groom), what happened to each meal today, and the plan its
  // meals follow.
  const { data: assignmentsData } = useQuery({ queryKey: ['stable-assignments'], queryFn: () => stableAssignmentApi.list() });
  const { data: tasksData } = useQuery({ queryKey: ['daily-tasks-all'], queryFn: () => dailyTaskApi.list() });
  const { data: plansData } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const idOf = (ref) => String(ref?._id || ref || '');
  const assignmentOf = (horse) => (assignmentsData?.data || []).find((a) => idOf(a.horse) === idOf(horse));
  const planOf = (horse) => (plansData?.data || []).find((p) => p.status === 'active' && idOf(p.horse) === idOf(horse));

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

  return (
    <div>
      {focus.horse ? (
        // One horse: its week meal by meal, then every day of its plan (or its daily ration).
        <HorseFeedingView
          horseId={focus.horse}
          horses={horsesData?.data || []}
          plans={plansData?.data || []}
          rations={data?.data || []}
          assignmentOf={assignmentOf}
          feedItems={feedItems}
          onOpenPlanner={openPlanner}
          onBack={focus.clear}
        />
      ) : (
        // Overview of all horses: who feeds each, today's meals, what needs a look. A click opens the horse.
        <RationHorseList
          action={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openPlanner(null)}>
              Tạo khẩu phần ăn
            </Button>
          }
          rations={data?.data || []}
          horses={horsesData?.data || []}
          tasks={tasksData?.data || []}
          assignmentOf={assignmentOf}
          planOf={planOf}
          onSelect={focus.select}
          loading={isLoading}
        />
      )}

      <RationPlanner
        open={planner.open}
        horseId={planner.horseId}
        onClose={() => setPlanner({ open: false, horseId: null })}
        horses={horsesData?.data || []}
        plans={plansData?.data || []}
        rations={data?.data || []}
        assignmentOf={assignmentOf}
        feedItems={feedItems}
        onPropose={() => setProposeOpen(true)}
      />

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
