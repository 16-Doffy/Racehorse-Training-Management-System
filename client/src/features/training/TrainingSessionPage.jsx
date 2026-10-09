import { useState, useCallback } from 'react';
import {
  Table,
  Button,
  Typography,
  Modal,
  Form,
  Select,
  DatePicker,
  Tag,
  InputNumber,
  Input,
  Segmented,
  Row,
  Col,
  Alert,
  Divider,
  Tooltip,
  Space,
} from 'antd';
import { message, notification } from '../../lib/antdStatic';
import {
  PlusOutlined,
  EditOutlined,
  CloseCircleOutlined,
  AimOutlined,
  PlayCircleOutlined,
  CalendarOutlined,
  UnorderedListOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trainingSessionApi, trainingPlanApi } from './trainingApi';
import { horsesApi } from '../horses/horsesApi';
import { raceApi } from '../race/raceApi';
import { healthRecordApi, EXAM_PRIORITY_OPTIONS } from '../health/healthApi';
import { useLockedHorseIds, useHorseClearances } from './useLockedHorses';
import { TRAINING_LEVEL_META, LEVEL_RANK, INTENSITY_RANK, intensityAllowed } from '../../constants/health';
import ReadinessPanel from './ReadinessPanel';
import PreCheckModal from './PreCheckModal';
import LiveSessionMonitor from './LiveSessionMonitor';
import { useClubPolicy, precheckRuleText, afternoonProblem } from './useClubPolicy';
import { SESSION_STATUS_LABELS as STATUS_LABELS, SESSION_STATUS_COLORS as STATUS_COLORS } from './sessionStatus';
import SessionOutcome from './SessionOutcome';
import confirmReadinessOverride, { needsOverride } from './confirmReadinessOverride';
import WeekCalendar from './WeekCalendar';
import {
  OBJECTIVE_LABELS,
  OBJECTIVE_DESCRIPTIONS,
  OBJECTIVE_COLORS,
  INTENSITY_LABELS,
  INTENSITY_COLORS,
  PHASE_LABELS,
  objectiveOptions,
  intensityOptions,
  SESSION_KINDS,
  kindOptions,
  KIND_SPEED_RANGES,
  PRESCRIPTION_LIMITS,
  METRIC_LIMITS,
  sessionTimeLabel,
  mondayOf,
  actualTimeLabel,
  TRAINER_ABORT_OPTIONS,
  DONE_STATUSES,
} from './trainingVocab';

const { Title, Text } = Typography;

const SESSION_TYPE_LABELS = { training: 'Buổi tập thường', trial_run: 'Lượt chạy thử' };
const futureTimeRule = {
  validator: (_, value) =>
    !value || value.isAfter(dayjs())
      ? Promise.resolve()
      : Promise.reject(new Error('Chọn giờ bắt đầu ở tương lai.')),
};

/** Renders the prescribed workout as a sentence a reader can follow without knowing the schema. */
function describePrescription(p) {
  if (!p) return null;
  const parts = [];
  if (p.distanceM) parts.push(`${p.distanceM}m`);
  if (p.reps && p.reps > 1) parts.push(`${p.reps} hiệp`);
  if (p.restMinutes) parts.push(`nghỉ ${p.restMinutes}'`);
  if (p.targetSpeedKmh) parts.push(`mục tiêu ${p.targetSpeedKmh} km/h`);
  if (p.targetHeartRateMax) parts.push(`nhịp tim ≤ ${p.targetHeartRateMax} bpm`);
  return parts.length ? parts.join(' · ') : null;
}

export default function TrainingSessionPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  // The week view is how a trainer reads training: what each horse does each day.
  const [view, setView] = useState('week');
  const [weekStart, setWeekStart] = useState(() => mondayOf(dayjs()));
  const [createForm] = Form.useForm();
  const [evalForm] = Form.useForm();
  const [endSession, setEndSession] = useState(null);
  const [endForm] = Form.useForm();
  const [abortSession, setAbortSession] = useState(null);
  const [abortForm] = Form.useForm();
  const draftKind = Form.useWatch('kind', createForm);
  const [examForm] = Form.useForm();
  const [examOpen, setExamOpen] = useState(false);
  const [preCheckSession, setPreCheckSession] = useState(null);
  const [scheduleSession, setScheduleSession] = useState(null);
  const [scheduleForm] = Form.useForm();
  const [cancelSession, setCancelSession] = useState(null);
  const [cancelForm] = Form.useForm();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const planFilter = searchParams.get('plan');
  const horseFilter = searchParams.get('horse');
  const lockedHorseIds = useLockedHorseIds();
  const clearances = useHorseClearances();

  // The readiness board has to follow what the trainer is currently typing, so these mirror the
  // form fields it depends on.
  const [draft, setDraft] = useState({});

  const { data: sessionsData, isLoading } = useQuery({
    // Re-fetches whenever the filter changes, letting the server do the filtering rather than
    // hiding rows client-side — keeps this consistent with every other list page in the app.
    queryKey: ['training-sessions', typeFilter, planFilter, horseFilter],
    queryFn: () =>
      trainingSessionApi.list({
        ...(typeFilter !== 'all' ? { sessionType: typeFilter } : {}),
        ...(planFilter ? { trainingPlan: planFilter } : {}),
        ...(horseFilter ? { horse: horseFilter } : {}),
      }),
    // A running session fills in from the sensor feed and closes itself: keep the board current.
    refetchInterval: (query) => {
      const sessions = query.state.data?.data || [];
      if (sessions.some((x) => x.status === 'in_progress')) return 5000;
      return sessions.some((x) => ['scheduled', 'ready', 'blocked'].includes(x.status)) ? 30000 : false;
    },
  });
  const { data: plansData } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: racesData } = useQuery({ queryKey: ['races'], queryFn: () => raceApi.list() });
  const draftSessionType = Form.useWatch('sessionType', createForm);
  const draftIsTrial = draftKind === 'trial' || draftSessionType === 'trial_run';
  // A trial is run for one of the horse's entries still to come.
  const trialRaceOptions = (racesData?.data || [])
    .filter((r) => String(r.horse?._id || r.horse) === String(draft.horse) && ['registered', 'confirmed'].includes(r.status) && dayjs(r.raceDate).isAfter(dayjs()))
    .map((r) => ({ value: r._id, label: `${r.raceName} — ${dayjs(r.raceDate).format('DD/MM/YYYY')}${r.distance ? ` · ${r.distance}m` : ''}` }));
  const firstWeek = searchParams.get('first') === '1';
  const policy = useClubPolicy();
  const draftAt = Form.useWatch('scheduledAt', createForm);
  const draftSlotProblem = afternoonProblem(policy, draftKind, draftAt);

  const filteredPlan = planFilter ? (plansData?.data || []).find((p) => p._id === planFilter) : null;
  const filteredHorse = horseFilter ? (horsesData?.data || []).find((h) => h._id === horseFilter) : null;

  const horseOptions = (horsesData?.data || []).map((h) => ({
    value: h._id,
    label: lockedHorseIds.has(h._id)
      ? `🔒 ${h.name} (đang bị khóa huấn luyện)`
      : h.trainingClearance?.restricted
        ? `🩹 ${h.name} (hồi phục — ${h.trainingClearance.label})`
        : h.name,
    disabled: lockedHorseIds.has(h._id),
  }));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['session-readiness'] });
  };

  const submitCreate = (values, overrideReason) => {
    const { prescription, ...rest } = values;
    createMutation.mutate({
      ...rest,
      scheduledAt: values.scheduledAt?.toISOString(),
      // Mongoose ignores a prescription of all-undefined, so an untargeted session stays untargeted
      // rather than being stored as a set of empty targets.
      prescription,
      ...(overrideReason ? { overrideReason } : {}),
    });
  };

  const createMutation = useMutation({
    mutationFn: (payload) => trainingSessionApi.create(payload),
    onSuccess: () => {
      message.success('Đã tạo buổi tập.');
      invalidate();
      setCreateOpen(false);
      createForm.resetFields();
      setDraft({});
    },
    onError: (err) => {
      // A blocked medical gate is final. An amber gate is the trainer's call: show the warnings and
      // ask for a reason for the record, rather than silently refusing or silently allowing.
      if (needsOverride(err)) {
        const values = createForm.getFieldsValue();
        confirmReadinessOverride({
          readiness: err.data.readiness,
          okText: 'Vẫn tạo buổi tập',
          onConfirm: (reason) => submitCreate(values, reason),
        });
        return;
      }
      message.error(err.message || 'Không thể tạo buổi tập.');
    },
  });

  // Starting is checked again against the current moment: the horse may have been fed or locked
  // since the session was booked.
  const startMutation = useMutation({
    mutationFn: ({ id, overrideReason }) => trainingSessionApi.start(id, overrideReason ? { overrideReason } : {}),
    onSuccess: () => {
      message.success('Buổi tập đã bắt đầu — số liệu cảm biến hiện ở đầu trang.');
      invalidate();
      // The live board sits above the calendar and the list: bring it into view.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (err, variables) => {
      // A refusal usually means the session is no longer in the state the table shows (held back by
      // a lock, pre-check too old): show it as it is now.
      if (err?.status === 409) invalidate();
      if (needsOverride(err)) {
        confirmReadinessOverride({
          readiness: err.data.readiness,
          okText: 'Vẫn bắt đầu',
          onConfirm: (reason) => startMutation.mutate({ id: variables.id, overrideReason: reason }),
        });
        return;
      }
      message.error(err.message || 'Không thể bắt đầu buổi tập.');
    },
  });

  const evalMutation = useMutation({
    mutationFn: ({ id, payload }) => trainingSessionApi.recordEvaluation(id, payload),
    onSuccess: (res) => {
      const outcome = res?.data?.outcome;
      message.success(outcome?.summary ? `Đã ghi nhận đánh giá. ${outcome.summary}` : 'Đã ghi nhận đánh giá.');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
      setEvalOpen(false);
    },
    onError: (err) => message.error(err.message || 'Ghi nhận thất bại.'),
  });

  const openEvaluation = (record) => {
    setActiveSession(record);
    evalForm.setFieldsValue({
      trainerComment: record.trainerComment,
      videoUrl: record.videoUrl,
      performanceRating: record.performanceRating,
    });
    setEvalOpen(true);
  };

  // Ending a run (the work is done) leads straight to its evaluation.
  const endMutation = useMutation({
    mutationFn: ({ id, metrics }) => trainingSessionApi.end(id, metrics ? { metrics } : {}),
    onSuccess: (res) => {
      const done = res?.data;
      message.success(done?.outcome?.summary ? `Đã kết thúc buổi tập. ${done.outcome.summary}` : 'Đã kết thúc buổi tập.');
      invalidate();
      setEndSession(null);
      endForm.resetFields();
      if (done) openEvaluation({ ...done, horse: endSession?.horse || done.horse });
    },
    onError: (err) => {
      if (err?.status === 409) invalidate();
      message.error(err.message || 'Không kết thúc được buổi tập.');
    },
  });

  const abortMutation = useMutation({
    mutationFn: ({ id, category, reason }) => trainingSessionApi.abort(id, { category, reason }),
    onSuccess: () => {
      message.success('Đã dừng buổi tập. Số liệu đến lúc dừng được giữ lại.');
      invalidate();
      setAbortSession(null);
      abortForm.resetFields();
    },
    onError: (err) => {
      if (err?.status === 409) invalidate();
      message.error(err.message || 'Không dừng được buổi tập.');
    },
  });

  // The sensor feed finished a run: offer its evaluation straight away.
  const offerEvaluation = useCallback(
    async (sessionId) => {
      const res = await trainingSessionApi.getOne(sessionId).catch(() => null);
      const done = res?.data;
      if (!done || done.status !== 'completed') return;
      const key = `done-${sessionId}`;
      notification.success({
        key,
        title: `${done.horse?.name || 'Ngựa'} đã xong buổi tập`,
        description: done.outcome?.summary || 'Buổi tập đã hoàn thành.',
        // Bottom right, and it goes by itself: the page's own actions are top right.
        placement: 'bottomRight',
        duration: 15,
        actions: (
          <Button
            type="primary"
            size="small"
            onClick={() => {
              notification.destroy(key);
              openEvaluation(done);
            }}
          >
            Đánh giá ngay
          </Button>
        ),
      });
    },
    // openEvaluation only sets state on this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // A session held back by a medical gate: ask the vet straight from it.
  const requestExamFor = (session) => {
    setDraft((current) => ({ ...current, horse: session.horse?._id || session.horse }));
    examForm.setFieldsValue({ priority: 'high', reason: `Buổi tập ${sessionTimeLabel(session.scheduledAt)} bị chặn: ${session.blockedReason || 'chưa đủ điều kiện'}` });
    setExamOpen(true);
  };

  const cancelMutation = useMutation({
    mutationFn: ({ id, cancelReason }) => trainingSessionApi.update(id, { status: 'cancelled', cancelReason }),
    onSuccess: () => {
      message.success('Đã hủy buổi tập. Buổi được giữ trong lịch sử.');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      setCancelSession(null);
      cancelForm.resetFields();
    },
    onError: (err) => {
      if (err?.status === 409) invalidate();
      message.error(err.message || 'Không hủy được buổi tập.');
    },
  });

  const openSchedule = (record) => {
    setScheduleSession(record);
    scheduleForm.setFieldsValue({ scheduledAt: dayjs().add(1, 'hour').startOf('minute') });
  };

  const scheduleMutation = useMutation({
    mutationFn: ({ session, scheduledAt }) =>
      session.status === 'missed'
        ? trainingSessionApi.reschedule(session._id, { scheduledAt })
        : trainingSessionApi.update(session._id, { scheduledAt }),
    onSuccess: (res, { session, scheduledAt }) => {
      message.success(session.status === 'missed' ? 'Đã xếp lại buổi tập. Buổi lỡ giờ được giữ trong lịch sử.' : 'Đã đổi giờ. Hãy kiểm tra sẵn sàng lại trước khi bắt đầu.');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      setWeekStart(mondayOf(dayjs(res.data?.scheduledAt || scheduledAt)));
      setScheduleSession(null);
      scheduleForm.resetFields();
    },
    onError: (err) => {
      if (err?.status === 409) invalidate();
      message.error(err.message || 'Không đổi được giờ tập.');
    },
  });

  const generateMutation = useMutation({
    mutationFn: ({ plan, start }) => trainingPlanApi.generateWeek(plan._id, { weekStart: start.toISOString() }),
    onSuccess: (res, { plan }) => {
      const { created = [], skipped = [] } = res.data || {};
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      const extra = skipped.length ? ` Không xếp: ${skipped.map((x) => x.reason).join(' ')}` : '';
      message.success(`Đã xếp ${created.length} buổi tập cho ${plan.horse?.name}.${extra}`, skipped.length ? 6 : 3);
    },
    onError: (err) => message.error(err.message || 'Không sinh được lịch tuần.'),
  });

  const examMutation = useMutation({
    mutationFn: (payload) => healthRecordApi.requestExam(payload),
    onSuccess: () => {
      message.success('Đã gửi yêu cầu khám tới bác sĩ thú y.');
      setExamOpen(false);
      examForm.resetFields();
    },
    onError: (err) => message.error(err.message || 'Gửi yêu cầu thất bại.'),
  });

  const columns = [
    {
      title: 'Ngựa',
      dataIndex: ['horse', 'name'],
      key: 'horse',
      render: (name, record) => (
        <span>
          <Link to={`/horses/${record.horse?._id}`}>{name}</Link>
          {lockedHorseIds.has(record.horse?._id) ? (
            <Tag color="red" className="ml-2">
              🔒 Đang khóa
            </Tag>
          ) : (
            clearances.get(String(record.horse?._id))?.restricted && (
              <Tag color={TRAINING_LEVEL_META[clearances.get(String(record.horse?._id)).level]?.color} className="ml-2">
                {TRAINING_LEVEL_META[clearances.get(String(record.horse?._id)).level]?.short}
              </Tag>
            )
          )}
        </span>
      ),
    },
    {
      title: 'Mục đích buổi tập',
      key: 'objective',
      render: (_, r) => (
        <div className="min-w-[220px] max-w-[300px] whitespace-normal">
          {r.kind && (
            <Tag color={SESSION_KINDS[r.kind]?.color} className="!mr-1">
              {SESSION_KINDS[r.kind]?.label}
            </Tag>
          )}
          <Tooltip title={OBJECTIVE_DESCRIPTIONS[r.objective]}>
            <Tag color={OBJECTIVE_COLORS[r.objective] || 'default'} className="!mr-1">
              {OBJECTIVE_LABELS[r.objective] || '—'}
            </Tag>
          </Tooltip>
          {r.intensity && (
            <Tag color={INTENSITY_COLORS[r.intensity]}>Cường độ {INTENSITY_LABELS[r.intensity]}</Tag>
          )}
          {r.sessionType === 'trial_run' && <Tag color="purple">{SESSION_TYPE_LABELS.trial_run}</Tag>}
          {describePrescription(r.prescription) && (
            <Text type="secondary" className="block !text-xs mt-1">
              {describePrescription(r.prescription)}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Thời gian',
      dataIndex: 'scheduledAt',
      key: 'scheduledAt',
      // The booked time and, once it has run, the real one: they are different facts.
      render: (d, r) => (
        <div className="whitespace-nowrap tabular-nums text-sm">
          <div>
            <Text type="secondary" className="!text-xs">
              Dự kiến{' '}
            </Text>
            {sessionTimeLabel(d)}
          </div>
          {actualTimeLabel(r) ? (
            <div>
              <Text type="secondary" className="!text-xs">
                Thực tế{' '}
              </Text>
              {actualTimeLabel(r)}
            </div>
          ) : (
            ['completed', 'evaluated'].includes(r.status) && (
              <Text type="secondary" className="!text-xs">
                Không ghi giờ thực tế (nhập tay)
              </Text>
            )
          )}
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s, r) => (
        <div>
          {s === 'blocked' && r.blockedReason ? (
            <Tooltip title={r.blockedReason}>
              <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s]}</Tag>
            </Tooltip>
          ) : (
            <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] || s}</Tag>
          )}
          {s === 'missed' && (
            <Text type="secondary" className="block !text-xs">
              {r.rescheduledTo ? 'Đã xếp lại lịch' : 'Chưa kiểm tra hoặc bắt đầu kịp; hãy xếp lại lịch.'}
            </Text>
          )}
          {r.readiness?.overrideReason && (
            <Tooltip title={`Đã ghi đè cảnh báo: ${r.readiness.overrideReason}`}>
              <Tag color="orange" className="!mt-1">
                ⚠️ Ghi đè
              </Tag>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: 'Kết quả',
      key: 'outcome',
      render: (_, r) => <SessionOutcome session={r} />,
    },
    {
      title: '',
      key: 'actions',
      // Pinned so Start/Evaluate stay reachable without scrolling the wide table sideways.
      fixed: 'right',
      render: (_, record) => (
        <Space size={4} wrap>
          {record.status === 'blocked' && (
            <Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => requestExamFor(record)}>
              Yêu cầu bác sĩ khám
            </Button>
          )}
          {['scheduled', 'blocked'].includes(record.status) && (
            <Button size="small" type="primary" icon={<SafetyCertificateOutlined />} onClick={() => setPreCheckSession(record)}>
              {record.status === 'blocked' ? 'Kiểm tra lại' : 'Kiểm tra sẵn sàng'}
            </Button>
          )}
          {record.status === 'ready' && (
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={startMutation.isPending && startMutation.variables?.id === record._id}
              onClick={() => startMutation.mutate({ id: record._id })}
            >
              Bắt đầu
            </Button>
          )}
          {(['scheduled', 'ready', 'blocked'].includes(record.status) || (record.status === 'missed' && !record.rescheduledTo)) && (
            <Button size="small" icon={<CalendarOutlined />} onClick={() => openSchedule(record)}>
              {record.status === 'missed' ? 'Xếp lại lịch' : 'Đổi giờ'}
            </Button>
          )}
          {record.status === 'in_progress' && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => setEndSession(record)}>
              Kết thúc
            </Button>
          )}
          {record.status === 'in_progress' && (
            <Button size="small" danger icon={<PauseCircleOutlined />} onClick={() => setAbortSession(record)}>
              Dừng giữa chừng
            </Button>
          )}
          {DONE_STATUSES.includes(record.status) && (
            <Button size="small" type={record.status === 'completed' ? 'primary' : 'default'} icon={<EditOutlined />} onClick={() => openEvaluation(record)}>
              {record.status === 'completed' ? 'Đánh giá' : 'Sửa đánh giá'}
            </Button>
          )}
          {['scheduled', 'ready', 'blocked'].includes(record.status) && (
            <Button size="small" danger icon={<StopOutlined />} onClick={() => setCancelSession(record)}>
              Hủy buổi
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const activePrescription = activeSession?.prescription;
  const preCheckModal = (
    <PreCheckModal
      session={preCheckSession}
      open={Boolean(preCheckSession)}
      onClose={() => setPreCheckSession(null)}
      onDone={invalidate}
      onRequestExam={() => {
        setDraft((current) => ({ ...current, horse: preCheckSession?.horse?._id }));
        setExamOpen(true);
      }}
    />
  );

  return (
    <div>
      {preCheckModal}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <div>
          <Title level={3} className="!mb-0">
            Buổi Tập &amp; Đánh giá
          </Title>
          <Typography.Text type="secondary" className="text-sm">
            Mỗi buổi tập có mục đích và nội dung cụ thể. Trước khi xếp lịch, hệ thống kiểm tra ngựa
            đã đủ điều kiện chưa — sức khỏe, dinh dưỡng và người chăm sóc.
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Tạo buổi tập
        </Button>
      </div>

      <Alert
        className="!mb-4"
        type="info"
        showIcon
        title="Xếp lịch → Kiểm tra sẵn sàng → Bắt đầu → Kết thúc → Đánh giá"
        description={`Xếp lịch chưa chạy cảm biến. ${precheckRuleText(policy)} Không kiểm tra hoặc bắt đầu kịp thì buổi chuyển sang Lỡ giờ và có thể xếp lại. Buổi đang chạy thì Kết thúc hoặc Dừng giữa chừng (giữ số liệu).${policy.afternoonLightOnly ? ' Buổi chiều chỉ tập nhẹ.' : ''}`}
      />

      {filteredPlan && (
        <Tag
          closable
          closeIcon={<CloseCircleOutlined />}
          onClose={() => setSearchParams({})}
          color="blue"
          className="mb-4"
        >
          Đang lọc theo kế hoạch: {filteredPlan.horse?.name} — {PHASE_LABELS[filteredPlan.phase] || filteredPlan.phase}
        </Tag>
      )}
      {filteredHorse && (
        <Tag
          closable
          closeIcon={<CloseCircleOutlined />}
          onClose={() => setSearchParams({})}
          color="blue"
          className="mb-4"
        >
          Đang lọc theo ngựa: {filteredHorse.name}
        </Tag>
      )}

      {firstWeek && filteredPlan && !(sessionsData?.data || []).length && (
        <Alert
          className="!mb-4"
          type="info"
          showIcon
          title={`Kế hoạch của ${filteredPlan.horse?.name || 'ngựa'} chưa có buổi tập nào`}
          description="Lập kế hoạch chỉ đặt ra giai đoạn và lịch tuần mẫu. Sinh lịch cho tuần đầu tiên để có các buổi tập cụ thể; người chăm sóc được báo lịch ngay."
          action={
            <Button
              type="primary"
              loading={generateMutation.isPending}
              onClick={() => {
                const start = dayjs(filteredPlan.phases?.[0]?.startDate || filteredPlan.startDate || undefined);
                const week = mondayOf(start.isBefore(dayjs()) ? dayjs() : start);
                setWeekStart(week);
                generateMutation.mutate({ plan: filteredPlan, start: week.toDate() });
              }}
            >
              Sinh lịch tuần đầu tiên
            </Button>
          }
        />
      )}
      <LiveSessionMonitor sessions={sessionsData?.data || []} onSessionCompleted={offerEvaluation} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'week', label: 'Lịch tuần', icon: <CalendarOutlined /> },
            { value: 'list', label: 'Danh sách', icon: <UnorderedListOutlined /> },
          ]}
        />
        <Segmented
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'training', label: SESSION_TYPE_LABELS.training },
            { value: 'trial_run', label: SESSION_TYPE_LABELS.trial_run },
          ]}
        />
      </div>

      {view === 'week' && (
        <WeekCalendar
          weekStart={weekStart}
          onWeekChange={(w) => setWeekStart(w || mondayOf(dayjs()))}
          sessions={sessionsData?.data || []}
          plans={(plansData?.data || []).filter((p) => (!planFilter || p._id === planFilter) && (!horseFilter || String(p.horse?._id) === horseFilter))}
          onGenerate={(plan, start) => generateMutation.mutate({ plan, start })}
          generatingPlanId={generateMutation.isPending ? generateMutation.variables?.plan._id : null}
          onStart={(session) => startMutation.mutate({ id: session._id })}
          onPreCheck={setPreCheckSession}
          startingId={startMutation.isPending ? startMutation.variables?.id : null}
          onEvaluate={openEvaluation}
          onSchedule={openSchedule}
          onCancel={setCancelSession}
          onEnd={setEndSession}
          onAbort={setAbortSession}
          onRequestExam={requestExamFor}
          schedulingId={scheduleMutation.isPending ? scheduleMutation.variables?.session._id : null}
        />
      )}

      <Table
        className={view === 'week' ? 'hidden' : ''}
        rowKey="_id"
        columns={columns}
        dataSource={sessionsData?.data}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        expandable={{
          expandedRowRender: (r) => (
            <div className="text-sm">
              {r.coachNote ? (
                <p className="!mb-1">
                  <Text strong>Dặn dò trước buổi: </Text>
                  {r.coachNote}
                </p>
              ) : null}
              {r.trainerComment ? (
                <p className="!mb-1">
                  <Text strong>Nhận xét sau buổi: </Text>
                  {r.trainerComment}
                </p>
              ) : null}
              {r.readiness?.gates?.length ? (
                <p className="!mb-0">
                  <Text strong>Tình trạng lúc xếp lịch: </Text>
                  {r.readiness.gates
                    .filter((g) => g.status !== 'ok')
                    .map((g) => `${g.label} — ${g.detail}`)
                    .join(' | ') || 'Tất cả điều kiện đều đạt.'}
                </p>
              ) : null}
              {!r.coachNote && !r.trainerComment && !r.readiness?.gates?.length && (
                <Text type="secondary">Buổi tập này chưa ghi chú gì thêm.</Text>
              )}
            </div>
          ),
        }}
        locale={{ emptyText: 'Chưa có buổi tập nào. Nhấn "Tạo buổi tập" để thêm buổi tập cho một kế hoạch.' }}
      />

      <Modal
        title="Tạo buổi tập mới"
        open={createOpen}
        width={1080}
        okText="Tạo buổi tập"
        cancelText="Hủy"
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(values) => submitCreate(values)}
          onValuesChange={(changed, all) => {
            // Picking a kind of work fills in what it normally means; every field stays editable.
            if (changed.kind && SESSION_KINDS[changed.kind]) {
              const k = SESSION_KINDS[changed.kind];
              createForm.setFieldsValue({ objective: k.objective, intensity: k.intensity, sessionType: k.sessionType, prescription: { ...k.prescription } });
              all = { ...all, objective: k.objective, intensity: k.intensity, sessionType: k.sessionType };
            }
            // A horse follows one plan at a time: file the session under it.
            if (changed.horse) {
              const plan = (plansData?.data || []).find((p) => String(p.horse?._id) === String(changed.horse) && p.status === 'active');
              createForm.setFieldValue('trainingPlan', plan?._id);
              // A trial defaults to the race the plan prepares for.
              createForm.setFieldValue('raceEntry', plan?.targetRace?._id || plan?.targetRace || undefined);
            }
            // A trial is run over its race's distance.
            const isTrialNow = (changed.kind || all.kind) === 'trial' || all.sessionType === 'trial_run';
            if (isTrialNow && (changed.raceEntry || changed.kind || changed.horse)) {
              const raceId = changed.raceEntry || createForm.getFieldValue('raceEntry');
              const r = (racesData?.data || []).find((x) => String(x._id) === String(raceId));
              if (r?.distance) createForm.setFieldValue(['prescription', 'distanceM'], r.distance);
            }
            // A recovering horse can't be booked above the vet's level: pull the intensity down to
            // the highest one allowed as soon as the horse is picked.
            let intensity = all.intensity;
            if (changed.horse || changed.kind) {
              const c = clearances.get(String(all.horse));
              if (c?.restricted && !intensityAllowed(c, intensity)) {
                const allowed = Object.keys(INTENSITY_RANK).filter((i) => INTENSITY_RANK[i] <= LEVEL_RANK[c.level]);
                if (allowed.length) {
                  intensity = allowed[allowed.length - 1];
                  createForm.setFieldValue('intensity', intensity);
                }
              }
            }
            setDraft({
              horse: all.horse,
              scheduledAt: all.scheduledAt?.toISOString(),
              // The adjusted value: setFieldValue doesn't re-trigger this handler.
              intensity,
              sessionType: all.sessionType,
              objective: all.objective,
            });
          }}
        >
          {/* Two columns on desktop so the readiness board stays in view and visibly reacts as the
              trainer picks a horse and a time — that live feedback is the point of the board. */}
          <Row gutter={24}>
            <Col xs={24} lg={15}>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
                    <Select placeholder="Chọn ngựa" options={horseOptions} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="trainingPlan"
                    label="Thuộc kế hoạch"
                    rules={[{ required: true, message: 'Ngựa này chưa có kế hoạch đang chạy — hãy lập kế hoạch trước' }]}
                  >
                    <Select
                      placeholder="Tự chọn theo ngựa"
                      options={(plansData?.data || [])
                        .filter((p) => ['active', 'draft'].includes(p.status) && (!draft.horse || String(p.horse?._id) === String(draft.horse)))
                        .map((p) => ({
                          value: p._id,
                          label: `${p.horse?.name} — ${p.goal || PHASE_LABELS[p.phase] || p.phase}`,
                        }))}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="kind"
                label="Loại buổi tập"
                extra={SESSION_KINDS[draftKind]?.hint || 'Chọn loại buổi để điền sẵn bài tập theo thông số thường dùng.'}
              >
                <Select
                  placeholder="Phi chậm, phi nhanh, tập dốc…"
                  options={kindOptions.map((o) => ({ value: o.value, label: o.label }))}
                />
              </Form.Item>

              {draftIsTrial && (
                <Form.Item
                  name="raceEntry"
                  label="Chạy thử cho giải"
                  rules={[{ required: true, message: 'Chọn giải mà buổi chạy thử này chuẩn bị' }]}
                  extra={trialRaceOptions.length ? 'Kết quả chạy thử hiện trên trang Đăng ký giải, cạnh đúng giải này.' : 'Ngựa chưa có giải sắp tới — đăng ký giải trước khi chạy thử.'}
                >
                  <Select placeholder="Chọn giải" options={trialRaceOptions} />
                </Form.Item>
              )}

              {draftSlotProblem && <Alert className="!mb-3" type="error" showIcon title={draftSlotProblem} />}

              <Form.Item
                name="objective"
                label="Mục đích buổi tập"
                initialValue="endurance"
                rules={[{ required: true }]}
              >
                <Select
                  options={objectiveOptions.map((o) => ({
                    value: o.value,
                    label: (
                      <div className="py-0.5">
                        <div className="font-medium">{o.label}</div>
                        <div className="text-xs text-gray-500">{o.description}</div>
                      </div>
                    ),
                  }))}
                />
              </Form.Item>

              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="intensity"
                    label="Cường độ"
                    initialValue="moderate"
                    extra={
                      clearances.get(String(draft.horse))?.restricted
                        ? `Bác sĩ chỉ cho ${clearances.get(String(draft.horse)).label} trong thời gian hồi phục.`
                        : null
                    }
                  >
                    <Select
                      options={intensityOptions.map((o) => ({
                        ...o,
                        disabled: !intensityAllowed(clearances.get(String(draft.horse)), o.value),
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="sessionType" label="Hình thức" initialValue="training">
                    <Select options={Object.entries(SESSION_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="scheduledAt"
                    label="Giờ bắt đầu dự kiến"
                    rules={[{ required: true, message: 'Chọn ngày giờ dự kiến bắt đầu' }, futureTimeRule]}
                    extra="Giờ thực tế được ghi khi bấm Bắt đầu."
                  >
                    <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} />
                  </Form.Item>
                </Col>
              </Row>

              <Divider titlePlacement="left" className="!my-2 !text-sm">
                <AimOutlined className="mr-1" />
                Nội dung dự kiến
              </Divider>
              <Text type="secondary" className="!text-xs block mb-2">
                Đặt mục tiêu ở đây để sau buổi tập hệ thống tự đối chiếu thực tế và kết luận đạt hay
                chưa đạt. Ngưỡng cảnh báo thể lực cũng lấy theo mục tiêu này thay vì ngưỡng chung.
              </Text>
              <Row gutter={16}>
                <Col xs={12} md={8}>
                  <Form.Item name={['prescription', 'distanceM']} label="Cự ly (m)">
                    <InputNumber min={PRESCRIPTION_LIMITS.distanceM[0]} max={PRESCRIPTION_LIMITS.distanceM[1]} step={100} className="w-full" placeholder="1200" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name={['prescription', 'reps']} label="Số hiệp">
                    <InputNumber min={PRESCRIPTION_LIMITS.reps[0]} max={PRESCRIPTION_LIMITS.reps[1]} className="w-full" placeholder="3" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name={['prescription', 'restMinutes']} label="Nghỉ giữa hiệp (phút)">
                    <InputNumber min={PRESCRIPTION_LIMITS.restMinutes[0]} max={PRESCRIPTION_LIMITS.restMinutes[1]} className="w-full" placeholder="8" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item
                    name={['prescription', 'targetSpeedKmh']}
                    label="Tốc độ mục tiêu (km/h)"
                    extra={KIND_SPEED_RANGES[draftKind] ? `${SESSION_KINDS[draftKind].label}: ${KIND_SPEED_RANGES[draftKind][0]}–${KIND_SPEED_RANGES[draftKind][1]} km/h` : null}
                  >
                    <InputNumber min={PRESCRIPTION_LIMITS.targetSpeedKmh[0]} max={PRESCRIPTION_LIMITS.targetSpeedKmh[1]} className="w-full" placeholder="35" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name={['prescription', 'targetHeartRateMax']} label="Nhịp tim tối đa (bpm)">
                    <InputNumber min={PRESCRIPTION_LIMITS.targetHeartRateMax[0]} max={PRESCRIPTION_LIMITS.targetHeartRateMax[1]} className="w-full" placeholder="170" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item
                    name={['prescription', 'durationMinutes']}
                    label="Thời lượng dự kiến (phút)"
                    extra="Cho bài tính theo thời gian (đi bộ). Bài phi kết thúc khi đủ cự ly."
                  >
                    <InputNumber min={PRESCRIPTION_LIMITS.durationMinutes[0]} max={PRESCRIPTION_LIMITS.durationMinutes[1]} className="w-full" placeholder="45" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="coachNote" label="Dặn dò trước buổi tập">
                <Input.TextArea rows={2} placeholder="VD: Giữ nhịp đều 2 hiệp đầu, bung sức hiệp cuối. Chú ý chân trước phải." />
              </Form.Item>
            </Col>
            <Col xs={24} lg={9}>
              <div className="lg:sticky lg:top-0">
                <ReadinessPanel
                  horse={draft.horse}
                  scheduledAt={draft.scheduledAt}
                  intensity={draft.intensity}
                  sessionType={draft.sessionType}
                  objective={draft.objective}
                  onRequestExam={() => setExamOpen(true)}
                />
                <Text type="secondary" className="!text-xs block mt-2">
                  Mỗi dòng do một người khác nắm giữ. Khóa y tế của bác sĩ, sốt, hoặc ngựa vừa ăn bữa có thức ăn tinh chưa
                  đủ {policy.digestHardMinutes} phút (theo quy định CLB) sẽ chặn hẳn buổi tập; các cảnh báo còn lại bạn vẫn có thể bỏ qua nhưng phải ghi lý do.
                </Text>
              </div>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={`${activeSession?.status === 'evaluated' ? 'Sửa đánh giá' : 'Đánh giá buổi tập'} — ${activeSession?.horse?.name || ''}`}
        open={evalOpen}
        okText="Lưu đánh giá"
        cancelText="Hủy"
        width={620}
        onCancel={() => setEvalOpen(false)}
        onOk={() => evalForm.submit()}
        confirmLoading={evalMutation.isPending}
        destroyOnHidden
      >
        {activeSession && (
          <Alert
            className="!mb-3"
            type="info"
            showIcon
            title={`Mục đích: ${OBJECTIVE_LABELS[activeSession.objective] || '—'}`}
            description={
              <div className="text-xs">
                {describePrescription(activePrescription) || 'Buổi tập này không đặt mục tiêu cụ thể.'}
                <div className="mt-1">
                  Dự kiến {sessionTimeLabel(activeSession.scheduledAt)}
                  {actualTimeLabel(activeSession) ? ` · Thực tế ${actualTimeLabel(activeSession)}` : ' · Chưa chạy (chưa bấm Bắt đầu)'}
                </div>
                {activeSession.coachNote && <div className="mt-1">Dặn dò: {activeSession.coachNote}</div>}
              </div>
            }
          />
        )}
        <Form
          form={evalForm}
          layout="vertical"
          onFinish={(values) =>
            // An emptied field must reach the server as '' so the link is cleared, not ignored.
            evalMutation.mutate({ id: activeSession._id, payload: { ...values, videoUrl: values.videoUrl || '', trainerComment: values.trainerComment || '' } })
          }
        >
          {activeSession && (
            <div className="mb-3">
              <Text strong className="!text-sm block mb-1">
                Kết quả đo được
              </Text>
              <SessionOutcome session={activeSession} />
            </div>
          )}
          <Form.Item name="performanceRating" label="Điểm phong độ (1 = kém, 10 = xuất sắc)" rules={[{ required: true, message: 'Chấm điểm phong độ' }]}>
            <InputNumber min={1} max={10} precision={0} className="w-full" placeholder="VD: 8" />
          </Form.Item>
          <Form.Item
            name="trainerComment"
            label="Nhận xét chuyên môn"
            extra="Ghi lại quan sát của bạn về phong độ, kỹ thuật, hoặc bất thường trong buổi tập này."
          >
            <Input.TextArea rows={3} placeholder="VD: Ngựa chạy ổn định, nên tăng nhẹ cường độ tuần tới." />
          </Form.Item>
          <Form.Item
            name="videoUrl"
            label="Link video buổi chạy"
            extra="Dán đường link YouTube/Drive để chủ sở hữu xem lại — nhất là với lượt chạy thử."
            rules={[{ type: 'url', message: 'Hãy nhập một đường link hợp lệ (bắt đầu bằng http:// hoặc https://).' }]}
          >
            <Input placeholder="https://..." allowClear />
          </Form.Item>
          {activeSession?.status === 'evaluated' && (
            <Alert type="info" showIcon title="Buổi này đã được đánh giá. Lưu lại sẽ sửa đánh giá; giá trị cũ được giữ trong nhật ký hệ thống." />
          )}
        </Form>
      </Modal>

      <Modal
        title={scheduleSession?.status === 'missed' ? 'Xếp lại buổi tập đã lỡ giờ' : 'Đổi giờ buổi tập'}
        open={Boolean(scheduleSession)}
        onCancel={() => setScheduleSession(null)}
        onOk={() => scheduleForm.submit()}
        okText="Lưu giờ tập mới"
        cancelText="Hủy"
        confirmLoading={scheduleMutation.isPending}
        destroyOnHidden
      >
        <Text className="block mb-3">
          {scheduleSession?.horse?.name} · Dự kiến cũ {scheduleSession ? sessionTimeLabel(scheduleSession.scheduledAt) : ''}
        </Text>
        <Alert
          className="!mb-3"
          type="info"
          showIcon
          title={scheduleSession?.status === 'missed' ? 'Buổi cũ được giữ làm lịch sử; hệ thống tạo buổi mới với cùng bài tập.' : 'Đổi giờ sẽ đưa buổi về Đã lên lịch. Bạn cần kiểm tra sẵn sàng lại.'}
        />
        <Form
          form={scheduleForm}
          layout="vertical"
          onFinish={(values) => scheduleMutation.mutate({ session: scheduleSession, scheduledAt: values.scheduledAt.toISOString() })}
        >
          <Form.Item name="scheduledAt" label="Giờ bắt đầu dự kiến mới" rules={[{ required: true, message: 'Chọn ngày giờ mới' }, futureTimeRule]}>
            <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Kết thúc buổi tập — ${endSession?.horse?.name || ''}`}
        open={Boolean(endSession)}
        onCancel={() => setEndSession(null)}
        onOk={() => endForm.submit()}
        okText="Kết thúc buổi tập"
        cancelText="Đóng"
        confirmLoading={endMutation.isPending}
        destroyOnHidden
      >
        {endSession && (
          <Form
            form={endForm}
            layout="vertical"
            onFinish={(values) => {
              const typed = Object.fromEntries(Object.entries(values.metrics || {}).filter(([, v]) => v !== undefined && v !== null));
              endMutation.mutate({ id: endSession._id, metrics: Object.keys(typed).length ? typed : undefined });
            }}
          >
            <Text className="block mb-2">
              Kết thúc ngay bây giờ: giờ kết thúc thực tế là lúc bấm, số liệu được đối chiếu với mục tiêu, buổi nặng sẽ giao việc chăm sóc sau tập cho nhân viên.
            </Text>
            {endSession.metrics?.sampleCount ? (
              <SessionOutcome session={endSession} />
            ) : (
              <>
                <Alert className="!mb-3" type="info" showIcon title="Buổi này chưa có số liệu cảm biến. Nhập số đo tay nếu có (không bắt buộc)." />
                <Row gutter={12}>
                  <Col xs={8}>
                    <Form.Item name={['metrics', 'distance']} label="Cự ly (m)">
                      <InputNumber min={METRIC_LIMITS.distance[0]} max={METRIC_LIMITS.distance[1]} step={100} className="w-full" />
                    </Form.Item>
                  </Col>
                  <Col xs={8}>
                    <Form.Item name={['metrics', 'maxSpeed']} label="Tốc độ tối đa">
                      <InputNumber min={METRIC_LIMITS.maxSpeed[0]} max={METRIC_LIMITS.maxSpeed[1]} className="w-full" />
                    </Form.Item>
                  </Col>
                  <Col xs={8}>
                    <Form.Item name={['metrics', 'avgHeartRate']} label="Nhịp tim TB">
                      <InputNumber min={METRIC_LIMITS.avgHeartRate[0]} max={METRIC_LIMITS.avgHeartRate[1]} className="w-full" />
                    </Form.Item>
                  </Col>
                </Row>
              </>
            )}
          </Form>
        )}
      </Modal>

      <Modal
        title={`Dừng giữa chừng — ${abortSession?.horse?.name || ''}`}
        open={Boolean(abortSession)}
        onCancel={() => setAbortSession(null)}
        onOk={() => abortForm.submit()}
        okText="Dừng buổi tập"
        okButtonProps={{ danger: true }}
        cancelText="Đóng"
        confirmLoading={abortMutation.isPending}
        destroyOnHidden
      >
        <Text className="block mb-3">
          Số liệu đo được đến lúc dừng và giờ dừng thực tế được giữ lại. Chọn "Sức khỏe" hoặc "Nghi chấn thương" thì bác sĩ nhận yêu cầu khám ưu tiên cao.
        </Text>
        <Form form={abortForm} layout="vertical" onFinish={(values) => abortMutation.mutate({ id: abortSession._id, ...values })}>
          <Form.Item name="category" label="Nhóm nguyên nhân" rules={[{ required: true, message: 'Chọn nhóm nguyên nhân' }]}>
            <Select options={TRAINER_ABORT_OPTIONS} placeholder="Chọn nhóm nguyên nhân" />
          </Form.Item>
          <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: 'Ghi lý do dừng' }]}>
            <Input.TextArea rows={2} placeholder="VD: Ngựa khập khiễng chân trước trái sau 300 m." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Hủy buổi tập"
        open={Boolean(cancelSession)}
        onCancel={() => setCancelSession(null)}
        onOk={() => cancelForm.submit()}
        okText="Hủy buổi tập"
        okButtonProps={{ danger: true }}
        cancelText="Đóng"
        confirmLoading={cancelMutation.isPending}
        destroyOnHidden
      >
        <Text className="block mb-3">
          {cancelSession?.horse?.name} · {cancelSession ? sessionTimeLabel(cancelSession.scheduledAt) : ''}
        </Text>
        <Form
          form={cancelForm}
          layout="vertical"
          onFinish={(values) => cancelMutation.mutate({ id: cancelSession._id, cancelReason: values.cancelReason })}
        >
          <Form.Item name="cancelReason" label="Lý do hủy" rules={[{ required: true, whitespace: true, message: 'Ghi lý do để giữ trong lịch sử' }]}>
            <Input.TextArea rows={2} placeholder="VD: Trời mưa lớn, sân trơn." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Yêu cầu bác sĩ kiểm tra"
        open={examOpen}
        onCancel={() => setExamOpen(false)}
        onOk={() => examForm.submit()}
        confirmLoading={examMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={examForm}
          layout="vertical"
          onFinish={(values) => examMutation.mutate({ horse: draft.horse, reason: values.reason, priority: values.priority })}
        >
          <Form.Item name="priority" label="Mức độ" initialValue="normal">
            <Select options={EXAM_PRIORITY_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Lý do"
            rules={[{ required: true, message: 'Vui lòng nhập lý do' }]}
            extra="Yêu cầu sẽ gửi thẳng tới bác sĩ được gán cho ngựa này."
          >
            <Input.TextArea rows={3} placeholder="VD: Cần giấy khám còn hiệu lực trước buổi chạy thử cuối tuần." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
