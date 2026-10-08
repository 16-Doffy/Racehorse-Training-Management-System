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
import { message } from '../../lib/antdStatic';
import {
  PlusOutlined,
  EditOutlined,
  CloseCircleOutlined,
  AimOutlined,
  PlayCircleOutlined,
  CalendarOutlined,
  UnorderedListOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trainingSessionApi, trainingPlanApi } from './trainingApi';
import { horsesApi } from '../horses/horsesApi';
import { healthRecordApi, EXAM_PRIORITY_OPTIONS } from '../health/healthApi';
import { useLockedHorseIds, useHorseClearances } from './useLockedHorses';
import { TRAINING_LEVEL_META, LEVEL_RANK, INTENSITY_RANK, intensityAllowed } from '../../constants/health';
import ReadinessPanel from './ReadinessPanel';
import PreCheckModal from './PreCheckModal';
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
} from './trainingVocab';

const { Title, Text } = Typography;

// What the evaluation form may still set with a bare status; the server accepts only completed and
// cancelled that way. Ready and blocked come from the pre-check, in_progress from "Bắt đầu".
const NEXT_STATUSES = {
  scheduled: ['completed', 'cancelled'],
  ready: ['cancelled'],
  blocked: ['cancelled'],
  in_progress: ['completed', 'cancelled'],
};
const statusOptionsFor = (current) =>
  [current, ...(NEXT_STATUSES[current] || [])].map((value) => ({ value, label: STATUS_LABELS[value] }));
const SESSION_TYPE_LABELS = { training: 'Buổi tập thường', trial_run: 'Lượt chạy thử' };

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
  const evalStatus = Form.useWatch('status', evalForm);
  const draftKind = Form.useWatch('kind', createForm);
  const [examForm] = Form.useForm();
  const [examOpen, setExamOpen] = useState(false);
  const [preCheckSession, setPreCheckSession] = useState(null);
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
    refetchInterval: (query) => (query.state.data?.data?.some((x) => x.status === 'in_progress') ? 5000 : false),
  });
  const { data: plansData } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });

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
      message.success('Buổi tập đã bắt đầu.');
      invalidate();
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
      status: record.status,
      metrics: {
        avgHeartRate: record.metrics?.avgHeartRate,
        maxSpeed: record.metrics?.maxSpeed,
        distance: record.metrics?.distance,
      },
    });
    setEvalOpen(true);
  };

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
        <Space size={4}>
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
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEvaluation(record)}
          >
            Đánh giá
          </Button>
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
      onRequestExam={() => setExamOpen(true)}
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
                    rules={[{ required: true, message: 'Chọn ngày giờ dự kiến bắt đầu' }]}
                    extra="Giờ thực tế được ghi khi bấm Bắt đầu."
                  >
                    <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" />
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
                  Mỗi dòng do một người khác nắm giữ. Khóa y tế của bác sĩ, hoặc ngựa vừa ăn xong chưa
                  đủ 60 phút, sẽ chặn hẳn buổi tập; các cảnh báo còn lại bạn vẫn có thể bỏ qua nhưng phải ghi lý do.
                </Text>
              </div>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={`Đánh giá buổi tập — ${activeSession?.horse?.name || ''}`}
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
            evalMutation.mutate({ id: activeSession._id, payload: { ...values, videoUrl: values.videoUrl || '' } })
          }
        >
          <Form.Item name="status" label="Trạng thái">
            <Select options={statusOptionsFor(activeSession?.status)} />
          </Form.Item>

          <Divider titlePlacement="left" className="!my-2 !text-sm">
            Chỉ số thực tế
          </Divider>
          <Text type="secondary" className="!text-xs block mb-2">
            Buổi tập có bật cảm biến sẽ tự điền. Buổi tập không bật thì nhập tay ở đây để hệ thống
            đối chiếu được với mục tiêu.
          </Text>
          <Row gutter={16}>
            <Col xs={8}>
              <Form.Item
                name={['metrics', 'avgHeartRate']}
                label="Nhịp tim TB (bpm)"
                extra={activePrescription?.targetHeartRateMax ? `Mục tiêu ≤ ${activePrescription.targetHeartRateMax}` : null}
              >
                <InputNumber min={METRIC_LIMITS.avgHeartRate[0]} max={METRIC_LIMITS.avgHeartRate[1]} className="w-full" />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item
                name={['metrics', 'maxSpeed']}
                label="Tốc độ tối đa (km/h)"
                extra={activePrescription?.targetSpeedKmh ? `Mục tiêu ≥ ${activePrescription.targetSpeedKmh}` : null}
              >
                <InputNumber min={METRIC_LIMITS.maxSpeed[0]} max={METRIC_LIMITS.maxSpeed[1]} className="w-full" />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item
                name={['metrics', 'distance']}
                label="Cự ly chạy (m)"
                extra={activePrescription?.distanceM ? `Mục tiêu ≥ ${activePrescription.distanceM}` : null}
              >
                <InputNumber min={METRIC_LIMITS.distance[0]} max={METRIC_LIMITS.distance[1]} step={100} className="w-full" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="performanceRating"
            label="Điểm phong độ (1 = kém, 10 = xuất sắc)"
            extra={evalStatus !== 'completed' ? 'Chấm điểm khi chuyển buổi tập sang "Đã hoàn thành".' : null}
          >
            <InputNumber min={1} max={10} className="w-full" placeholder="VD: 8" disabled={evalStatus !== 'completed'} />
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
          {/* Mirrors the server rule in trainingSession.controller.js createPostSessionCare. */}
          {(activeSession?.intensity === 'high' || activeSession?.objective === 'race_simulation') &&
          activeSession?.status !== 'completed' ? (
            <Alert
              type="warning"
              showIcon
              title="Đây là buổi tập nặng"
              description="Khi chuyển sang 'Đã hoàn thành', hệ thống sẽ tự giao việc ngâm chân và tắm cho nhân viên chăm sóc phụ trách, đồng thời báo kết quả cho chủ sở hữu. Nếu nhịp tim trung bình vượt mục tiêu từ 10%, bác sĩ sẽ nhận được yêu cầu khám."
            />
          ) : activeSession?.status !== 'completed' ? (
            <Alert
              type="info"
              showIcon
              title="Khi hoàn thành, chủ sở hữu sẽ nhận được thông báo kết quả buổi tập."
            />
          ) : null}
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
