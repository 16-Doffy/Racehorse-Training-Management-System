import { useState, useCallback, useEffect } from 'react';
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
  Dropdown,
  Grid,
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
  MoreOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trainingSessionApi, trainingPlanApi } from './trainingApi';
import { horsesApi } from '../horses/horsesApi';
import { raceApi } from '../race/raceApi';
import RequestExamModal from '../health/RequestExamModal';
import { useLockedHorseIds, useHorseClearances } from './useLockedHorses';
import { TRAINING_LEVEL_META, LEVEL_RANK, INTENSITY_RANK, intensityAllowed } from '../../constants/health';
import ReadinessPanel from './ReadinessPanel';
import PreCheckModal from './PreCheckModal';
import LiveSessionMonitor from './LiveSessionMonitor';
import SessionReplay from './SessionReplay';
import MovingHorse3D from '../horses/horse3d/MovingHorse3D';
import { hourOf, motionOfKind, surfaceOf } from '../horses/horse3d/horseMotion';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import { useClubPolicy, precheckRuleText, afternoonProblem } from './useClubPolicy';
import { SESSION_STATUS_LABELS as STATUS_LABELS, SESSION_STATUS_COLORS as STATUS_COLORS } from './sessionStatus';
import SessionOutcome from './SessionOutcome';
import confirmReadinessOverride, { needsOverride } from './confirmReadinessOverride';
import WeekCalendar from './WeekCalendar';
import {
  OBJECTIVE_LABELS,
  OBJECTIVE_DESCRIPTIONS,
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
  TRIAL_MIN_RACE_SHARE,
  canReplay,
} from './trainingVocab';
import { newestFirst } from '../../utils/newestFirst';

const { Text } = Typography;
const { useBreakpoint } = Grid;

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
  const screens = useBreakpoint();
  const isDesktop = screens.md ?? (typeof window !== 'undefined' ? window.innerWidth >= 768 : true);
  const [searchParams, setSearchParams] = useSearchParams();
  // ?new=1 (the dashboard's "Lập buổi tập mới") lands with the create form already open.
  const [createOpen, setCreateOpen] = useState(() => searchParams.get('new') === '1');
  const [evalOpen, setEvalOpen] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  // The week view is how a trainer reads training: what each horse does each day.
  // A notification about one session (?session=<id>) opens the list on that row, highlighted.
  const focusSession = searchParams.get('session');
  const [view, setView] = useState(() => (searchParams.get('session') ? 'list' : 'week'));
  const [weekStart, setWeekStart] = useState(() => mondayOf(dayjs()));
  const [createForm] = Form.useForm();
  const [evalForm] = Form.useForm();
  const [endSession, setEndSession] = useState(null);
  const [endForm] = Form.useForm();
  const [abortSession, setAbortSession] = useState(null);
  // The finished run being played back.
  const [replaySession, setReplaySession] = useState(null);
  const [abortForm] = Form.useForm();
  const draftKind = Form.useWatch('kind', createForm);
  const draftSpeed = Form.useWatch(['prescription', 'targetSpeedKmh'], createForm);
  const draftPlanId = Form.useWatch('trainingPlan', createForm);
  // The exam request being written: { horseId, session?, defaults? }.
  const [examFor, setExamFor] = useState(null);
  const [preCheckSession, setPreCheckSession] = useState(null);
  const [scheduleSession, setScheduleSession] = useState(null);
  const [scheduleForm] = Form.useForm();
  const [cancelSession, setCancelSession] = useState(null);
  const [cancelForm] = Form.useForm();
  const queryClient = useQueryClient();
  const planFilter = searchParams.get('plan');
  // Drop ?new=1 once read, so a reload or Back does not open the form again.
  useEffect(() => {
    if (!searchParams.has('new')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const horseFilter = searchParams.get('horse');
  const lockedHorseIds = useLockedHorseIds();
  const clearances = useHorseClearances();

  // The readiness board has to follow what the trainer is currently typing, so these mirror the
  // form fields it depends on.
  const [draft, setDraft] = useState({});

  const { data: sessionsData, isLoading, isError, error, refetch } = useQuery({
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
  const listRows = newestFirst(sessionsData?.data);
  const focusIndex = focusSession ? listRows.findIndex((r) => r._id === focusSession) : -1;
  useEffect(() => {
    if (focusIndex < 0) return undefined;
    const timer = setTimeout(() => document.querySelector('[data-focus="session"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
    return () => clearTimeout(timer);
  }, [focusIndex]);
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: racesData } = useQuery({ queryKey: ['races'], queryFn: () => raceApi.list() });
  const draftSessionType = Form.useWatch('sessionType', createForm);
  const draftIsTrial = draftKind === 'trial' || draftSessionType === 'trial_run';
  // A trial is run for one of the horse's entries still to come.
  const trialRaceOptions = (racesData?.data || [])
    .filter((r) => String(r.horse?._id || r.horse) === String(draft.horse) && ['registered', 'confirmed'].includes(r.status) && dayjs(r.raceDate).isAfter(dayjs()))
    .map((r) => ({ value: r._id, label: `${r.raceName} — ${dayjs(r.raceDate).format('DD/MM/YYYY')}${r.distance ? ` · ${r.distance}m` : ''}` }));
  // The trial's distance against its race's: shown beside the field, with a warning when much shorter.
  const draftRaceId = Form.useWatch('raceEntry', createForm);
  const draftDistance = Form.useWatch(['prescription', 'distanceM'], createForm);
  const draftRace = draftIsTrial ? (racesData?.data || []).find((r) => String(r._id) === String(draftRaceId)) : null;
  const trialShare = draftRace?.distance && draftDistance ? draftDistance / draftRace.distance : null;
  const trialTooShort = trialShare !== null && trialShare < TRIAL_MIN_RACE_SHARE;
  const firstWeek = searchParams.get('first') === '1';
  const policy = useClubPolicy();
  const draftAt = Form.useWatch('scheduledAt', createForm);
  const draftSlotProblem = afternoonProblem(policy, draftKind, draftAt);

  const filteredPlan = planFilter ? (plansData?.data || []).find((p) => p._id === planFilter) : null;
  const filteredHorse = horseFilter ? (horsesData?.data || []).find((h) => h._id === horseFilter) : null;
  const draftHorse = draft.horse ? (horsesData?.data || []).find((h) => String(h._id) === String(draft.horse)) : null;
  const allSessions = sessionsData?.data || [];

  const horseOptions = (horsesData?.data || []).map((h) => ({
    value: h._id,
    label: lockedHorseIds.has(h._id)
      ? `${h.name} (đang bị khóa huấn luyện)`
      : h.trainingClearance?.restricted
        ? `${h.name} (hồi phục — ${h.trainingClearance.label})`
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
  const requestExamFor = (session) =>
    setExamFor({
      horseId: session.horse?._id || session.horse,
      session,
      defaults: { priority: 'high', reason: `Buổi tập ${sessionTimeLabel(session.scheduledAt)} bị chặn: ${session.blockedReason || 'chưa đủ điều kiện'}` },
    });

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

  // An hour from now, unless that falls in the afternoon for work the club keeps to the morning:
  // then the next morning at the club's session time.
  const suggestedTime = (record) => {
    const soon = dayjs().add(1, 'hour').startOf('minute');
    if (!afternoonProblem(policy, record.kind, soon)) return soon;
    const [h, m] = (policy.morningTime || '07:30').split(':').map(Number);
    const morning = soon.hour(h).minute(m).second(0);
    return morning.isAfter(dayjs()) ? morning : morning.add(1, 'day');
  };
  const openSchedule = (record) => {
    setScheduleSession(record);
    scheduleForm.setFieldsValue({ scheduledAt: suggestedTime(record) });
  };
  const scheduleAt = Form.useWatch('scheduledAt', scheduleForm);
  const scheduleSlotProblem = afternoonProblem(policy, scheduleSession?.kind, scheduleAt);

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

  const columns = [
    {
      title: 'Ngựa',
      dataIndex: ['horse', 'name'],
      key: 'horse',
      render: (name, record) => (
        <div className="whitespace-nowrap">
          <Link to={`?horse=${record.horse?._id}`} title="Xem lịch của riêng ngựa này" className="font-semibold text-emerald-950 hover:text-emerald-700">
            {name}
          </Link>
          {lockedHorseIds.has(record.horse?._id) ? (
            <Tag color="red" className="ml-2 !text-xs">
              Khóa tập
            </Tag>
          ) : (
            clearances.get(String(record.horse?._id))?.restricted && (
              <Tag color={TRAINING_LEVEL_META[clearances.get(String(record.horse?._id)).level]?.color} className="ml-2 !text-xs">
                {TRAINING_LEVEL_META[clearances.get(String(record.horse?._id)).level]?.short}
              </Tag>
            )
          )}
        </div>
      ),
    },
    {
      title: 'Bài tập & Mục tiêu',
      key: 'objective',
      render: (_, r) => (
        <div className="min-w-[200px] max-w-[320px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">
              {SESSION_KINDS[r.kind]?.label || r.kind || 'Buổi tập'}
            </span>
            {r.sessionType === 'trial_run' && (
              <Tag color="purple" className="!m-0 text-[11px] leading-tight">
                Chạy thử
              </Tag>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <Tooltip title={OBJECTIVE_DESCRIPTIONS[r.objective]}>
              <span className="cursor-help hover:text-gray-700 underline decoration-dotted">
                {OBJECTIVE_LABELS[r.objective] || '—'}
              </span>
            </Tooltip>
            {r.intensity && (
              <>
                <span className="text-gray-300">·</span>
                <Tag color={INTENSITY_COLORS[r.intensity]} className="!m-0 text-[11px] leading-tight px-1.5 py-0">
                  {INTENSITY_LABELS[r.intensity]}
                </Tag>
              </>
            )}
          </div>
          {describePrescription(r.prescription) && (
            <Tooltip title={describePrescription(r.prescription)}>
              <Text type="secondary" className="block !text-[11px] text-gray-400 mt-0.5 truncate cursor-default">
                {describePrescription(r.prescription)}
              </Text>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: 'Thời gian',
      dataIndex: 'scheduledAt',
      key: 'scheduledAt',
      render: (d, r) => (
        <div className="whitespace-nowrap tabular-nums text-sm">
          <div>
            <Text type="secondary" className="!text-xs">
              Dự kiến{' '}
            </Text>
            <span className="font-medium text-gray-800">{sessionTimeLabel(d)}</span>
          </div>
          {actualTimeLabel(r) ? (
            <div className="text-gray-500">
              <Text type="secondary" className="!text-xs">
                Thực tế{' '}
              </Text>
              {actualTimeLabel(r)}
            </div>
          ) : (
            ['completed', 'evaluated'].includes(r.status) && (
              <Text type="secondary" className="!text-xs text-gray-400">
                Chưa ghi giờ thực tế
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
              <Tag color={STATUS_COLORS[s]} className="font-medium">
                {STATUS_LABELS[s]}
              </Tag>
            </Tooltip>
          ) : (
            <Tag color={STATUS_COLORS[s]} className="font-medium">
              {STATUS_LABELS[s] || s}
            </Tag>
          )}
          {s === 'missed' && (
            <Text type="secondary" className="block !text-xs mt-0.5">
              {r.rescheduledTo ? 'Đã xếp lại lịch' : 'Lỡ thời hạn; hãy xếp lại.'}
            </Text>
          )}
          {r.readiness?.overrideReason && (
            <Tooltip title={`Đã ghi đè cảnh báo: ${r.readiness.overrideReason}`}>
              <Tag color="orange" className="!mt-1 !text-xs">
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
      fixed: isDesktop ? 'right' : false,
      render: (_, record) => {
        const moreItems = [];
        const canSchedule = (['scheduled', 'ready', 'blocked'].includes(record.status) || (record.status === 'missed' && !record.rescheduledTo));
        const canCancel = ['scheduled', 'ready', 'blocked'].includes(record.status);

        if (canSchedule && record.status !== 'missed') {
          moreItems.push({
            key: 'schedule',
            icon: <CalendarOutlined />,
            label: 'Đổi giờ tập',
            onClick: () => openSchedule(record),
          });
        }
        if (canCancel) {
          moreItems.push({
            key: 'cancel',
            icon: <StopOutlined />,
            danger: true,
            label: 'Hủy buổi tập',
            onClick: () => setCancelSession(record),
          });
        }

        return (
          <Space size={6} wrap>
            {/* 1. Primary Action by status */}
            {['scheduled', 'blocked'].includes(record.status) && (
              <Button
                size="small"
                type="primary"
                icon={<SafetyCertificateOutlined />}
                onClick={() => setPreCheckSession(record)}
              >
                {record.status === 'blocked' ? 'Kiểm tra lại' : 'Kiểm tra sẵn sàng'}
              </Button>
            )}
            {record.status === 'blocked' && (
              <Button
                size="small"
                icon={<SafetyCertificateOutlined />}
                onClick={() => requestExamFor(record)}
              >
                Yêu cầu bác sĩ khám
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
            {record.status === 'in_progress' && (
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => setEndSession(record)}
              >
                Kết thúc
              </Button>
            )}
            {/* 2. Direct Danger action for in_progress */}
            {record.status === 'in_progress' && (
              <Button
                size="small"
                danger
                icon={<PauseCircleOutlined />}
                onClick={() => setAbortSession(record)}
              >
                Dừng giữa chừng
              </Button>
            )}
            {/* 3. Completed / Evaluated */}
            {record.status === 'completed' && (
              <Button
                size="small"
                type="primary"
                icon={<EditOutlined />}
                onClick={() => openEvaluation(record)}
              >
                Đánh giá
              </Button>
            )}
            {record.status === 'evaluated' && (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEvaluation(record)}
              >
                Sửa đánh giá
              </Button>
            )}
            {canReplay(record) && (
              <Button size="small" icon={<HistoryOutlined />} onClick={() => setReplaySession(record)}>
                Xem lại buổi chạy
              </Button>
            )}
            {/* 4. Missed reschedule primary */}
            {record.status === 'missed' && !record.rescheduledTo && (
              <Button
                size="small"
                type="primary"
                icon={<CalendarOutlined />}
                onClick={() => openSchedule(record)}
              >
                Xếp lại lịch
              </Button>
            )}

            {/* 5. Dropdown for secondary actions */}
            {moreItems.length > 0 && (
              <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="bottomRight">
                <Button size="small" icon={<MoreOutlined />} aria-label="Thao tác khác" />
              </Dropdown>
            )}
          </Space>
        );
      },
    },
  ];

  const activePrescription = activeSession?.prescription;
  const preCheckModal = (
    <PreCheckModal
      session={preCheckSession}
      open={Boolean(preCheckSession)}
      onClose={() => setPreCheckSession(null)}
      onDone={invalidate}
      onRequestExam={() => setExamFor({ horseId: preCheckSession?.horse?._id, session: preCheckSession, defaults: { priority: 'high' } })}
    />
  );
  // The view and the kind of session: on the week picker's row in the week view, on their own over the list.
  const toolbar = (
    <>
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
    </>
  );

  return (
    <div>
      {preCheckModal}
      <PageHeroBanner
        eyebrow="Lịch tập & đường đua"
        roleLabel="HLV trưởng"
        title="Buổi tập & đánh giá thể lực"
        subtitle="Xếp lịch, kiểm tra sẵn sàng y tế và dinh dưỡng, giám sát trực tiếp buổi tập và ghi nhận đánh giá."
        stats={[
          { label: 'Tổng số buổi', value: `${allSessions.length} buổi` },
          { label: 'Hôm nay', value: `${allSessions.filter((s) => dayjs(s.scheduledAt).isSame(dayjs(), 'day')).length} buổi` },
          { label: 'Đang diễn ra', value: `${allSessions.filter((s) => s.status === 'in_progress').length} buổi` },
        ]}
        actionButton={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
            className="!h-9 !px-4 !rounded-lg !bg-[#D4AF37] hover:!bg-[#E2C058] !border-[#D4AF37] !text-[#061812] font-semibold cursor-pointer shrink-0"
          >
            Tạo buổi tập mới
          </Button>
        }
      />

      {/* The club's rule in one line; the steps of a session open on demand. */}
      <details className="light-surface-box mb-4 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-xs text-gray-700">
        <summary className="cursor-pointer select-none">
          <SafetyCertificateOutlined className="mr-1.5 text-[#0F5A43]" />
          <span className="font-medium text-gray-900">Quy định CLB:</span> kiểm tra sẵn sàng từ {policy.precheckOpensBeforeMin} phút trước đến{' '}
          {policy.precheckClosesAfterMin} phút sau giờ tập{policy.afternoonLightOnly ? ', buổi chiều chỉ tập nhẹ' : ''}.{' '}
          <span className="font-medium text-[#0F5A43]">Xem các bước</span>
        </summary>
        <ol className="m-0 mt-2 pl-5 space-y-0.5 leading-relaxed">
          <li>Xếp lịch: kế hoạch tự xếp tuần này và tuần sau; buổi lỡ giờ xếp lại được ngay trên lịch.</li>
          <li>Kiểm tra sẵn sàng. {precheckRuleText(policy)}</li>
          <li>Bắt đầu: số liệu cảm biến và ngựa chạy 3D hiện ở đầu trang.</li>
          <li>Kết thúc khi đủ cự ly, hoặc dừng giữa chừng để giữ số liệu; rồi đánh giá buổi.</li>
        </ol>
      </details>

      {isError && (
        <Alert
          type="error"
          showIcon
          className="!mb-4"
          title="Chưa tải được danh sách buổi tập"
          description={error?.message || 'Không thể lấy dữ liệu buổi tập lúc này.'}
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      )}

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
          Đang xem lịch của ngựa: {filteredHorse.name}
        </Tag>
      )}
      {filteredHorse && (
        <Link to={`/horses/${filteredHorse._id}`} className="mb-4 ml-1 inline-block text-sm">
          Mở hồ sơ ngựa
        </Link>
      )}

      {firstWeek && filteredPlan && !(sessionsData?.data || []).length && (
        <Alert
          className="!mb-4"
          type="info"
          showIcon
          title={`Kế hoạch của ${filteredPlan.horse?.name || 'ngựa'} chưa có buổi tập nào`}
          description="Lịch tuần này và tuần sau được xếp tự động khi áp dụng kế hoạch. Chưa có buổi nào nghĩa là kế hoạch bắt đầu muộn hơn; bấm để xếp tuần đầu tiên ngay."
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
              Xếp tuần đầu tiên
            </Button>
          }
        />
      )}
      <LiveSessionMonitor sessions={sessionsData?.data || []} horses={horsesData?.data || []} plans={plansData?.data || []} onSessionCompleted={offerEvaluation} />

      {view === 'list' && <div className="mb-4 flex flex-wrap items-center gap-3">{toolbar}</div>}

      {view === 'week' && (
        <WeekCalendar
          toolbar={toolbar}
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
          onReplay={setReplaySession}
          schedulingId={scheduleMutation.isPending ? scheduleMutation.variables?.session._id : null}
        />
      )}

      <Table
        className={view === 'week' ? 'hidden' : ''}
        rowClassName={(r) => (focusSession && r._id === focusSession ? 'row-focus' : '')}
        onRow={(r) => (focusSession && r._id === focusSession ? { 'data-focus': 'session' } : {})}
        rowKey="_id"
        columns={columns}
        dataSource={listRows}
        loading={isLoading && !sessionsData}
        // Opened on the page holding the session a notification points at (remounted once it is found).
        key={focusIndex >= 0 ? `focus-${focusSession}` : 'list'}
        pagination={focusIndex >= 0 ? { defaultCurrent: Math.floor(focusIndex / 10) + 1 } : undefined}
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
            // the highest one allowed as soon as the horse is picked — never below what the kind of
            // work is (a canter stays moderate; the readiness panel then says it isn't allowed).
            let intensity = all.intensity;
            if (changed.horse || changed.kind) {
              const c = clearances.get(String(all.horse));
              const kindFloor = INTENSITY_RANK[SESSION_KINDS[all.kind]?.intensity] || 0;
              if (c?.restricted && !intensityAllowed(c, intensity)) {
                const allowed = Object.keys(INTENSITY_RANK).filter((i) => INTENSITY_RANK[i] <= LEVEL_RANK[c.level] && INTENSITY_RANK[i] >= kindFloor);
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
                  // A recovering horse: work above the vet's level is not offered (the kind is the work).
                  options={kindOptions.map((o) => ({
                    value: o.value,
                    label: o.label,
                    disabled: !intensityAllowed(clearances.get(String(draft.horse)), SESSION_KINDS[o.value]?.intensity),
                  }))}
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
                        disabled: !intensityAllowed(clearances.get(String(draft.horse)), o.value) || INTENSITY_RANK[o.value] < (INTENSITY_RANK[SESSION_KINDS[draftKind]?.intensity] || 0),
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
                  <Form.Item
                    name={['prescription', 'distanceM']}
                    label="Cự ly (m)"
                    validateStatus={trialTooShort ? 'warning' : undefined}
                    help={trialTooShort ? `Chỉ bằng ${Math.round(trialShare * 100)}% cự ly giải (${draftRace.distance} m): khó nói lên sức bền cho giải. Vẫn lưu được.` : undefined}
                    extra={draftRace?.distance && !trialTooShort ? `Cự ly giải: ${draftRace.distance} m` : undefined}
                  >
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
                {/* The picked horse, in its own coat, doing the picked work at the target speed. */}
                {draftKind && (
                  <div className="mb-3">
                    <MovingHorse3D creditInFrame
                      breed={draftHorse?.breed}
                      color={draftHorse?.color}
                      motion={motionOfKind(draftKind, draftSpeed)}
                      surface={surfaceOf((plansData?.data || []).find((p) => p._id === draftPlanId), draft.scheduledAt || undefined)}
                      hour={hourOf(draft.scheduledAt)}
                      height={170}
                      compact
                    />
                  </div>
                )}
                <ReadinessPanel
                  horse={draft.horse}
                  scheduledAt={draft.scheduledAt}
                  intensity={draft.intensity}
                  sessionType={draft.sessionType}
                  objective={draft.objective}
                  onRequestExam={() => setExamFor({ horseId: draft.horse })}
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

      <SessionReplay
        session={replaySession}
        horse={replaySession && (horsesData?.data || []).find((h) => String(h._id) === String(replaySession.horse?._id || replaySession.horse))}
        plan={replaySession && (plansData?.data || []).find((p) => String(p._id) === String(replaySession.trainingPlan?._id || replaySession.trainingPlan))}
        onClose={() => setReplaySession(null)}
      />

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
        {scheduleSlotProblem && <Alert className="!mb-3" type="error" showIcon title={scheduleSlotProblem} />}
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

      {examFor?.horseId && (
        <RequestExamModal
          horse={(horsesData?.data || []).find((h) => String(h._id) === String(examFor.horseId)) || examFor.session?.horse || { _id: examFor.horseId }}
          session={examFor.session}
          defaults={examFor.defaults}
          onClose={() => setExamFor(null)}
        />
      )}
    </div>
  );
}
