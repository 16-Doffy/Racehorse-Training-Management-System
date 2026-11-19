import { Button, Typography, Modal, Form, Select, InputNumber, Input, Tag, Tooltip, Radio, Alert, Empty, Segmented, Skeleton, Pagination } from 'antd';
import { useState } from 'react';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, EditOutlined, FlagOutlined, ScheduleOutlined, WarningOutlined, EnvironmentOutlined, ColumnWidthOutlined, AppstoreOutlined, TrophyOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { raceApi } from './raceApi';
import { horsesApi } from '../horses/horsesApi';
import { trainingSessionApi, trainingPlanApi } from '../training/trainingApi';
import { SURFACE_LABELS, DONE_STATUSES, minPrepFor } from '../training/trainingVocab';
import { RaceFormTag } from '../training/RaceForm';
import PlanTimeline from '../training/PlanTimeline';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import ReviewExamNote from '../health/ReviewExamNote';
import RaceEntryForm from './RaceEntryForm';
import { useClubPolicy } from '../training/useClubPolicy';
import './race.css';

const { Text } = Typography;

const STATUS_LABELS = {
  registered: 'Đã đăng ký',
  confirmed: 'Đã xác nhận tham gia',
  completed: 'Đã thi đấu xong',
  withdrawn: 'Đã rút lui',
};
const STATUS_COLORS = { registered: 'default', confirmed: 'blue', completed: 'green', withdrawn: 'red' };
const refId = (x) => String(x?._id || x || '');
const PHASE_WORDS = { base_building: 'Nền tảng', strength: 'Sức mạnh', speed: 'Tốc độ', peak: 'Giảm tải', recovery: 'Hồi phục' };
const raceDayOf = (entry) => dayjs(entry.raceDate).startOf('day');
const isBeforeRaceDay = (entry) => raceDayOf(entry).isAfter(dayjs().startOf('day'));
const isPast = (entry) => raceDayOf(entry).isBefore(dayjs().startOf('day'));

/**
 * The trial run of this entry: only sessions linked to it (never "same horse, around those dates", which
 * mixes up two races close together) — the last one run, else the next one booked.
 */
function trialFor(entry, trials) {
  const mine = trials.filter((s) => refId(s.raceEntry) === String(entry._id) && !['cancelled', 'missed'].includes(s.status));
  const done = mine.filter((s) => DONE_STATUSES.includes(s.status)).sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  if (done.length) return done[0];
  return mine.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0] || null;
}

const metricsLine = (m = {}) =>
  [m.distance ? `${m.distance}m` : null, m.maxSpeed ? `tối đa ${m.maxSpeed} km/h` : null, m.avgHeartRate ? `nhịp tim TB ${Math.round(m.avgHeartRate)}` : null]
    .filter(Boolean)
    .join(' · ');


/** Race day as a calendar leaf, and how far off it is. */
function DateLeaf({ entry }) {
  const day = raceDayOf(entry);
  const days = day.diff(dayjs().startOf('day'), 'day');
  const open = ['registered', 'confirmed'].includes(entry.status);
  return (
    <div className="rc-date" aria-label={`Ngày đua ${day.format('DD/MM/YYYY')}`}>
      <span className="rc-date-day">{day.format('DD')}</span>
      <span className="rc-date-month">Th{day.format('M')} · {day.format('YYYY')}</span>
      {open && days >= 0 && <span className={`rc-date-left${days <= 7 ? ' is-soon' : ''}`}>{days === 0 ? 'Hôm nay' : `Còn ${days} ngày`}</span>}
      {days < 0 && <span className="rc-date-left is-past">Đã qua</span>}
    </div>
  );
}

const STEP_CLASS = (c) => (c.ok === true ? 'is-ok' : c.ok === false ? 'is-bad' : /^Đang tập/.test(c.detail || '') ? 'is-now' : '');
const STEP_ICON = (c) => (c.ok === true ? '✓' : c.ok === false ? '!' : /^Đang tập/.test(c.detail || '') ? '▸' : '•');

/**
 * How the horse's preparation for this race stands: its plan's phases on a bar, then the steps it must
 * clear in order — the vet, each phase judged done by the trainer, the race's trial — and why it is not
 * ready yet (server training/raceForm.js). Without a plan for this race, the call to make one.
 */
function PrepBlock({ entry, plan, otherPlan, trial, onPlan }) {
  const form = plan?.progress?.form;
  if (!plan) {
    return (
      <div className="rc-noplan">
        <span>
          <WarningOutlined className="mr-1.5 text-amber-600" />
          {otherPlan
            ? `Ngựa đang theo kế hoạch cho mục tiêu khác — chưa có kế hoạch cho giải này, nên chưa thể xác nhận dự giải.`
            : 'Chưa có kế hoạch huấn luyện cho giải này — ngựa phải hoàn thành từng giai đoạn của kế hoạch mới được dự giải.'}
        </span>
        {!otherPlan && (
          <Button size="small" className="rc-primary" icon={<ScheduleOutlined />} onClick={onPlan}>
            Lập kế hoạch
          </Button>
        )}
      </div>
    );
  }
  const steps = (form?.checks || []).filter((c) => c.key !== 'trial');
  const trialCheck = (form?.checks || []).find((c) => c.key === 'trial');
  const reasons = Array.isArray(form?.reasons) ? form.reasons : [];
  return (
    <div className="rc-prep">
      <div className="rc-prep-head">
        <span>Chuẩn bị cho giải</span>
        {form && <RaceFormTag form={form} />}
      </div>
      {plan.phases?.length > 0 && <PlanTimeline phases={plan.phases} raceDate={entry.raceDate} compact />}
      <div className="rc-steps" aria-label="Các bước trước khi dự giải">
        {[...steps, ...(trialCheck ? [trialCheck] : [])].map((c, i) => (
          <span key={c.key} className="contents">
            {i > 0 && <span className="rc-step-arrow" aria-hidden="true">→</span>}
            <Tooltip title={`${c.label}: ${c.detail}`}>
              <span className={`rc-step ${STEP_CLASS(c)}`}>
                <span className="rc-step-dot" aria-hidden="true">{STEP_ICON(c)}</span>
                {c.label === 'Y tế bác sĩ' ? 'Y tế' : c.label}
                <small>{c.detail}</small>
              </span>
            </Tooltip>
          </span>
        ))}
      </div>
      {trial && DONE_STATUSES.includes(trial.status) && (
        <div className="text-xs text-gray-600">
          Chạy thử {dayjs(trial.scheduledAt).format('DD/MM')}: {trial.outcome?.met === true ? 'đạt' : trial.outcome?.met === false ? 'chưa đạt' : 'đã chạy'}
          {metricsLine(trial.metrics) ? ` · ${metricsLine(trial.metrics)}` : ''}
        </div>
      )}
      {reasons.length > 0 && <p className={`rc-why${form?.status === 'not_ready' || form?.status === 'blocked' ? ' is-bad' : ''}`}>{reasons.join(' ')}</p>}
    </div>
  );
}

function DecisionCell({ entry }) {
  const d = entry.decision;
  return (
    <div className="flex flex-col gap-1">
      {d?.at && (
        <Text type="secondary" className="!text-xs line-clamp-3" title={d.reason || undefined}>
          {/* Withdrawn by the system: the horse could not be ready in time (server: planProgress.service.js). */}
          {d.auto ? 'Hệ thống tự rút' : d.by?.name || 'HLV'} · {dayjs(d.at).format('DD/MM HH:mm')}
          {d.status === 'confirmed' ? (d.exception ? ' · ngoại lệ, chưa chạy thử' : d.trialMet === false ? ' · chạy thử chưa đạt' : ' · dựa trên chạy thử') : ''}
          {d.reason ? ` — ${d.reason}` : ''}
        </Text>
      )}
      {!d?.at && entry.status === 'confirmed' && <Text type="secondary" className="!text-xs">Xác nhận cũ (chưa ghi người quyết định)</Text>}
      {entry.status === 'registered' && !isPast(entry) && (
        <Text className="!text-xs font-medium">Chưa quyết định: chốt trước ngày đua {raceDayOf(entry).format('DD/MM')}</Text>
      )}
      {/* Health changed after the horse was confirmed: the trainer decides again (withdraw, or confirm once fit). */}
      {entry.reviewNeeded && (
        <>
          <Tag color="warning" icon={<WarningOutlined />} className="!m-0 w-fit">
            Cần xem lại quyết định
          </Tag>
          {entry.reviewReason && <Text type="warning" className="!text-xs">Sức khỏe thay đổi: {entry.reviewReason}</Text>}
          <ReviewExamNote horseId={entry.horse?._id || entry.horse} since={entry.reviewFlaggedAt} />
        </>
      )}
    </div>
  );
}

/**
 * The trainer's decision whether the horse goes. The trial is shown as evidence next to the horse's
 * medical state; a passed trial is not the same as being fit to race, and the server checks the medical
 * state again when the decision is filed.
 */
function DecisionModal({ entry, horse, plan, onClose, onDone }) {
  const [form] = Form.useForm();
  const decision = Form.useWatch('decision', form);
  const policy = useClubPolicy();
  // The horse goes only having come through its plan for this race, every phase judged done (the server checks it too).
  const stages = plan?.progress?.form?.phases || [];
  const left = stages.filter((s) => s.state !== 'passed');
  const prepBlocked =
    policy.raceNeedsPhasesDone === false
      ? null
      : !plan
        ? 'Ngựa chưa có kế hoạch huấn luyện cho giải này.'
        : left.length
          ? `Ngựa chưa hoàn thành giai đoạn ${left.map((s) => PHASE_WORDS[s.key] || s.key).join(', ')} — HLV đánh giá hoàn thành từng giai đoạn trên trang Kế hoạch huấn luyện trước.`
          : null;
  const trialId = Form.useWatch('trialSession', form);
  const { data, isLoading } = useQuery({ queryKey: ['race-trials', entry?._id], queryFn: () => raceApi.trials(entry._id), enabled: Boolean(entry) });
  const linked = data?.data || [];
  const done = linked.filter((t) => DONE_STATUSES.includes(t.status));
  const chosen = done.find((t) => t._id === trialId) || null;
  const clearance = horse?.trainingClearance;
  const grounded = clearance?.level === 'none' || ['injured', 'quarantined'].includes(horse?.healthStatus);
  const recovering = !grounded && clearance?.restricted;
  const needsReason = decision === 'withdrawn' || (decision === 'confirmed' && (!chosen || chosen.outcome?.met === false));

  const mutation = useMutation({
    mutationFn: (values) => raceApi.decision(entry._id, values),
    onSuccess: (_res, values) => {
      message.success(values.decision === 'confirmed' ? 'Đã xác nhận tham gia giải.' : 'Đã rút khỏi giải.');
      form.resetFields();
      onDone();
    },
    onError: (err) => message.error(err.message || 'Không ghi được quyết định.'),
  });

  return (
    <Modal
      open={Boolean(entry)}
      title={`Quyết định dự giải — ${entry?.horse?.name || ''} · ${entry?.raceName || ''}`}
      okText="Ghi quyết định"
      cancelText="Đóng"
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      okButtonProps={{ disabled: decision === 'confirmed' && Boolean(prepBlocked) }}
      width={640}
      destroyOnHidden
    >
      {entry && (
        <Form
          form={form}
          layout="vertical"
          initialValues={{ decision: prepBlocked ? 'withdrawn' : 'confirmed', trialSession: done[0]?._id }}
          key={done[0]?._id || 'none'}
          onFinish={(values) => mutation.mutate({ decision: values.decision, trialSession: values.decision === 'confirmed' ? values.trialSession : undefined, reason: values.reason })}
        >
          <Text strong className="block mb-1">Tiến độ các giai đoạn</Text>
          <div className="mb-3 flex flex-col gap-2">
            {stages.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {stages.map((s) => (
                  <Tag key={s.index} color={s.state === 'passed' ? 'green' : s.state === 'unfinished' ? 'red' : 'default'} className="!m-0">
                    {s.state === 'passed' ? '✓' : s.state === 'unfinished' ? '✗' : '•'} {PHASE_WORDS[s.key] || s.key}
                    {s.state === 'passed' && s.at ? ` · đạt ${dayjs(s.at).format('DD/MM')}` : s.state === 'current' ? ' · đang tập' : s.state === 'ahead' ? ' · chưa tới' : s.state === 'unfinished' ? ' · chưa hoàn thành' : ''}
                  </Tag>
                ))}
              </div>
            )}
            {prepBlocked ? (
              <Alert type="error" showIcon title="Chưa thể xác nhận tham gia" description={`${prepBlocked} Có thể rút khỏi giải.`} />
            ) : stages.length > 0 ? (
              <Alert type="success" showIcon title="Đã hoàn thành các giai đoạn của kế hoạch" />
            ) : null}
          </div>
          <Text strong className="block mb-1">Bằng chứng chạy thử & y tế</Text>
          <div className="mb-3 flex flex-col gap-2">
            {isLoading ? (
              <Text type="secondary">Đang tải buổi chạy thử…</Text>
            ) : done.length ? (
              <Form.Item name="trialSession" label="Buổi chạy thử dùng để quyết định" className="!mb-0">
                <Select
                  options={done.map((t) => ({
                    value: t._id,
                    label: `${dayjs(t.scheduledAt).format('DD/MM HH:mm')} · ${t.outcome?.met === true ? 'Đạt' : t.outcome?.met === false ? 'Chưa đạt' : 'Đã chạy'} · ${metricsLine(t.metrics)}`,
                  }))}
                />
              </Form.Item>
            ) : (
              <Alert type="warning" showIcon title="Chưa có buổi chạy thử nào của giải này đã chạy xong." description="Xác nhận lúc này là ngoại lệ: cần ghi lý do theo quy định CLB." />
            )}
            {chosen?.outcome?.summary && <Text type="secondary" className="!text-xs">{chosen.outcome.summary}</Text>}
            <Alert
              type={grounded ? 'error' : recovering ? 'warning' : 'success'}
              showIcon
              title={grounded ? 'Bác sĩ đang khóa tập / ngựa chấn thương — không xác nhận được' : recovering ? `Đang hồi phục: bác sĩ chỉ cho ${clearance.label}` : 'Không có hạn chế y tế nào đang hiệu lực'}
              description="Chạy thử đạt không đồng nghĩa đủ điều kiện thi đấu: hệ thống kiểm tra lại tình trạng y tế ngay lúc ghi quyết định."
            />
            {entry.reviewNeeded && <Alert type="warning" showIcon title="Sức khỏe đã thay đổi sau lần xác nhận trước" description={entry.reviewReason} />}
          </div>
          <Form.Item name="decision" label="Quyết định">
            <Radio.Group
              options={[
                { value: 'confirmed', label: 'Tham gia giải', disabled: Boolean(prepBlocked) },
                { value: 'withdrawn', label: 'Rút khỏi giải' },
              ]}
              optionType="button"
              buttonStyle="solid"
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Lý do"
            rules={[{ required: needsReason, whitespace: true, message: decision === 'withdrawn' ? 'Ghi lý do rút' : 'Ghi lý do (ngoại lệ hoặc chạy thử chưa đạt)' }]}
            extra={needsReason ? null : 'Không bắt buộc khi đã có buổi chạy thử đạt.'}
          >
            <Input.TextArea rows={2} placeholder={decision === 'withdrawn' ? 'VD: Ngựa đang hồi phục chấn thương gân.' : 'VD: Chạy thử đạt, sức khỏe tốt, sẵn sàng thi đấu.'} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

// The list in the order of work, a title over each group.
const GROUPS = [
  { key: 'result', label: 'Đã đua — cần nhập kết quả' },
  { key: 'upcoming', label: 'Sắp diễn ra' },
  { key: 'completed', label: 'Đã thi đấu xong' },
  { key: 'withdrawn', label: 'Đã rút' },
];
const PAGE_SIZES = [6, 12, 24];

// The club's rule, by distance: how long before a race it can be entered (trainingVocab minPrepFor).
const RULE_DISTANCES = [
  { m: 1200, label: '≤ 1200 m' },
  { m: 2000, label: '≤ 2000 m' },
  { m: 2400, label: '> 2000 m' },
];

// Registration, the plan that prepares the horse phase by phase, the trial, the decision and the result.
export default function RacePage() {
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [resultRace, setResultRace] = useState(null);
  const [decisionRace, setDecisionRace] = useState(null);
  const [paging, setPaging] = useState({ key: '', page: 1 });
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [resultForm] = Form.useForm();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const policy = useClubPolicy();

  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['races'], queryFn: () => raceApi.list() });
  // A notification about one horse's race (?horse=<id>) shows that horse's entries only.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusHorse = searchParams.get('horse');
  const baseRaces = focusHorse ? (data?.data || []).filter((r) => String(r.horse?._id || r.horse) === focusHorse) : data?.data || [];
  const shownRaces = baseRaces.filter((r) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'reviewNeeded') return Boolean(r.reviewNeeded);
    return r.status === statusFilter;
  });
  const focusName = focusHorse ? (data?.data || []).find((r) => String(r.horse?._id || r.horse) === focusHorse)?.horse?.name : null;
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: plansData } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const { data: trialsData } = useQuery({
    queryKey: ['training-sessions', 'trial_run'],
    queryFn: () => trainingSessionApi.list({ sessionType: 'trial_run' }),
  });
  const trials = trialsData?.data || [];
  const horseById = new Map((horsesData?.data || []).map((h) => [String(h._id), h]));
  const plans = plansData?.data || [];
  const activePlanByHorse = new Map(plans.filter((p) => p.status === 'active').map((p) => [refId(p.horse), p]));
  // The plan that prepares the horse for this race: active, or completed (it ends a few days before the race).
  const planFor = (entry) => {
    const mine = plans.filter((p) => refId(p.targetRace) === String(entry._id) && ['active', 'completed'].includes(p.status));
    return mine.find((p) => p.status === 'active') || mine[0] || null;
  };

  // A horse the vet has grounded or is still recovering can't be entered (the server refuses it too).
  const horseOptions = (horsesData?.data || []).map((h) => {
    const level = h.trainingClearance?.level;
    const grounded = level === 'none' || h.healthStatus === 'injured' || h.healthStatus === 'quarantined';
    const recovering = !grounded && h.trainingClearance?.restricted;
    return {
      value: h._id,
      disabled: grounded || recovering,
      label: grounded ? `${h.name} (bác sĩ đang khóa / chấn thương)` : recovering ? `${h.name} (đang hồi phục)` : h.name,
    };
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['races'] });
    queryClient.invalidateQueries({ queryKey: ['race-trials'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload) => raceApi.create(payload),
    onSuccess: () => {
      message.success('Đã đăng ký giải đua. Bấm "Lập kế hoạch" trên thẻ giải để bắt đầu chuẩn bị cho ngựa.');
      refresh();
      setOpen(false);
    },
    onError: (err) => message.error(err.message || 'Đăng ký thất bại.'),
  });

  const resultMutation = useMutation({
    mutationFn: ({ id, payload }) => raceApi.results(id, payload),
    onSuccess: (_res, { payload }) => {
      message.success(payload.prizeMoney ? 'Đã lưu kết quả — tiền thưởng đã ghi vào doanh thu của chủ ngựa.' : 'Đã lưu kết quả.');
      refresh();
      setResultRace(null);
    },
    onError: (err) => message.error(err.message || 'Cập nhật thất bại.'),
  });

  const waiting = (data?.data || []).filter((r) => (r.status === 'registered' || r.reviewNeeded) && !isPast(r));
  const firstWaitingId = waiting.length ? String(waiting.reduce((a, b) => (raceDayOf(b).isBefore(raceDayOf(a)) ? b : a))._id) : null;
  const decisionLabel = (r) => (r.reviewNeeded ? 'Xem lại quyết định' : r.status === 'registered' ? 'Quyết định dự giải' : 'Đổi quyết định');

  // The buttons of one entry.
  const actionsFor = (record) => {
    const open = ['registered', 'confirmed'].includes(record.status);
    const plan = planFor(record);
    const otherPlan = !plan && activePlanByHorse.get(refId(record.horse));
    return (
      <div className="rc-actions">
        {open && !isPast(record) && !plan && !otherPlan && (
          <Button icon={<ScheduleOutlined />} onClick={() => navigate(`/training/plans?race=${record._id}`)}>
            Lập kế hoạch
          </Button>
        )}
        {plan && (
          <Button icon={<ScheduleOutlined />} onClick={() => navigate(`/training/plans?plan=${plan._id}`)}>
            Xem kế hoạch
          </Button>
        )}
        {['registered', 'confirmed', 'withdrawn'].includes(record.status) && !isPast(record) && (
          <Button className={String(record._id) === firstWaitingId ? 'rc-primary' : ''} icon={<FlagOutlined />} onClick={() => setDecisionRace(record)}>
            {decisionLabel(record)}
          </Button>
        )}
        {!isBeforeRaceDay(record) && record.status !== 'withdrawn' && (
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setResultRace(record);
              resultForm.setFieldsValue({ position: record.position, finishTime: record.finishTime, prizeMoney: record.prizeMoney || undefined, result: record.result });
            }}
          >
            Cập nhật kết quả
          </Button>
        )}
      </div>
    );
  };

  /** One entry: the day, the horse and the race, its preparation (or result), the decision, the buttons. */
  const card = (r) => {
    const plan = planFor(r);
    const otherPlan = !plan && activePlanByHorse.get(refId(r.horse));
    const open = ['registered', 'confirmed'].includes(r.status);
    return (
      <article key={r._id} className={`rc-card is-${r.status}${r.reviewNeeded ? ' needs-review' : ''}`}>
        <DateLeaf entry={r} />
        <div className="rc-main">
          <div className="rc-head">
            <div className="min-w-0">
              <Link to={`/horses/${r.horse?._id || r.horse}`} className="rc-horse">
                {r.horse?.name || 'Ngựa'}
              </Link>
              <div className="rc-race">{r.raceName}</div>
              <div className="rc-meta">
                {r.venue && (
                  <span>
                    <EnvironmentOutlined /> {r.venue}
                  </span>
                )}
                {r.distance && (
                  <span>
                    <ColumnWidthOutlined /> {r.distance} m
                  </span>
                )}
                {r.surface && (
                  <span>
                    <AppstoreOutlined /> {SURFACE_LABELS[r.surface]}
                  </span>
                )}
              </div>
            </div>
            <Tag color={STATUS_COLORS[r.status]} className="!m-0">
              {STATUS_LABELS[r.status] || r.status}
            </Tag>
          </div>
          {open && !isPast(r) && <PrepBlock entry={r} plan={plan} otherPlan={otherPlan} trial={trialFor(r, trials)} onPlan={() => navigate(`/training/plans?race=${r._id}`)} />}
          {r.status === 'completed' && (r.position || r.result || r.prizeMoney > 0) && (
            <div className="rc-result">
              {r.position && <span className="rc-medal">#{r.position}</span>}
              {r.finishTime && <span>Về đích {r.finishTime}</span>}
              {r.result && <span className="font-medium">{r.result}</span>}
              {r.prizeMoney > 0 && (
                <span>
                  <TrophyOutlined /> Thưởng {Number(r.prizeMoney).toLocaleString('vi-VN')} ₫
                </span>
              )}
            </div>
          )}
          <div className="rc-decision">
            <DecisionCell entry={r} />
          </div>
        </div>
        {actionsFor(r)}
      </article>
    );
  };
  // Coming races soonest first, then the ones run or dropped, latest first.
  const today = dayjs().startOf('day');
  // The order of work: races run but without a result first, then the coming ones (one to look at again
  // first, then the soonest), then those run (latest first), and last those withdrawn.
  const groupOf = (r) => {
    if (r.status === 'withdrawn') return 'withdrawn';
    if (r.status === 'completed') return 'completed';
    return raceDayOf(r).isBefore(today) ? 'result' : 'upcoming';
  };
  const byDate = (dir) => (a, b) => dir * (new Date(a.raceDate) - new Date(b.raceDate));
  const ordered = GROUPS.flatMap((g) =>
    shownRaces
      .filter((r) => groupOf(r) === g.key)
      .sort((a, b) => (g.key === 'upcoming' ? Number(Boolean(b.reviewNeeded)) - Number(Boolean(a.reviewNeeded)) || byDate(1)(a, b) : byDate(g.key === 'result' ? 1 : -1)(a, b)))
      .map((r) => ({ r, group: g.key }))
  );
  const groupCounts = Object.fromEntries(GROUPS.map((g) => [g.key, ordered.filter((x) => x.group === g.key).length]));
  // Pages: back to the first whenever the filter changes.
  const pageKey = `${statusFilter}|${focusHorse || ''}`;
  const page = paging.key === pageKey ? paging.page : 1;
  const lastPage = Math.max(1, Math.ceil(ordered.length / pageSize));
  const shownPage = Math.min(page, lastPage);
  const pageItems = ordered.slice((shownPage - 1) * pageSize, shownPage * pageSize);

  const racesList = data?.data || [];
  const registeredCount = racesList.filter((r) => r.status === 'registered').length;
  const confirmedCount = racesList.filter((r) => r.status === 'confirmed').length;
  const completedCount = racesList.filter((r) => r.status === 'completed').length;
  const upcomingCount = racesList.filter((r) => isBeforeRaceDay(r)).length;

  return (
    <div className="rc">
      <PageHeroBanner
        eyebrow="Thi đấu & giải thưởng"
        roleLabel="HLV trưởng"
        title="Đăng ký & quản lý giải đua"
        subtitle="Đăng ký đủ sớm theo cự ly, chuẩn bị theo kế hoạch từng giai đoạn, rồi quyết định dự giải dựa trên đánh giá của HLV và buổi chạy thử."
        stats={[
          { label: 'Đã đăng ký', value: `${registeredCount} giải` },
          { label: 'Đã xác nhận tham gia', value: `${confirmedCount} ngựa` },
          { label: 'Sắp diễn ra', value: `${upcomingCount} giải` },
          { label: 'Đã hoàn thành', value: `${completedCount} giải` },
        ]}
        actionButton={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setOpen(true)}
            className="!h-9 !px-4 !rounded-lg !bg-[#D4AF37] hover:!bg-[#E2C058] !border-[#D4AF37] !text-[#061812] font-semibold cursor-pointer"
          >
            Đăng ký giải mới
          </Button>
        }
      />

      {/* The club's rules, in one line above the list. */}
      <div className="rc-rules">
        <InfoCircleOutlined />
        {policy.raceEntryMinPrep !== false && (
          <>
            <strong>Đăng ký trước tối thiểu:</strong>
            {RULE_DISTANCES.map((d) => {
              const need = minPrepFor(d.m);
              return (
                <Tooltip key={d.m} title={`${need.weeks} tuần huấn luyện + ${need.prepDays} ngày chuẩn bị (khởi động kế hoạch, hồi phục, nghỉ – khám – di chuyển)`}>
                  <span className="rc-rule-chip">
                    {d.label} <em>{need.days} ngày</em>
                  </span>
                </Tooltip>
              );
            })}
          </>
        )}
        <span>
          {policy.raceNeedsPhasesDone !== false
            ? 'Ngựa dự giải khi HLV đã đánh giá hoàn thành từng giai đoạn (không nhảy bậc) và chạy thử đạt.'
            : 'Ngựa dự giải dựa trên đánh giá của HLV và buổi chạy thử.'}
        </span>
      </div>

      {isError && (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          title="Chưa tải được danh sách giải đua"
          description={error?.message || 'Không thể lấy dữ liệu giải đua lúc này.'}
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      )}

      {focusHorse && (
        <Tag closable onClose={() => setSearchParams({}, { replace: true })} color="gold" className="!mb-3">
          Đang xem riêng {focusName || 'ngựa được chọn'} · bấm × để xem tất cả
        </Tag>
      )}

      <div className="st-toolbar mb-3">
        <Segmented
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: `Tất cả (${baseRaces.length})` },
            { value: 'registered', label: `Đã đăng ký (${baseRaces.filter((r) => r.status === 'registered').length})` },
            { value: 'confirmed', label: `Đã xác nhận (${baseRaces.filter((r) => r.status === 'confirmed').length})` },
            ...(baseRaces.some((r) => r.reviewNeeded) ? [{ value: 'reviewNeeded', label: `Cần xem lại (${baseRaces.filter((r) => r.reviewNeeded).length})` }] : []),
            { value: 'completed', label: `Đã thi đấu xong (${baseRaces.filter((r) => r.status === 'completed').length})` },
            { value: 'withdrawn', label: `Đã rút (${baseRaces.filter((r) => r.status === 'withdrawn').length})` },
          ]}
        />
      </div>

      {isLoading && !data ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : shownRaces.length ? (
        <>
          <div className="rc-list">
            {pageItems.map(({ r, group }, i) => (
              <div key={r._id} className="contents">
                {/* A group's title wherever it starts, and again at the top of a page it runs on to. */}
                {(i === 0 || pageItems[i - 1].group !== group) && (
                  <div className={`rc-group-title is-${group}`}>
                    {GROUPS.find((g) => g.key === group).label} · {groupCounts[group]}
                    {i === 0 && (shownPage - 1) * pageSize > 0 && ordered[(shownPage - 1) * pageSize - 1]?.group === group ? ' (tiếp)' : ''}
                  </div>
                )}
                {card(r)}
              </div>
            ))}
          </div>
          {ordered.length > PAGE_SIZES[0] && (
            <div className="rc-pager">
              <Pagination
                current={shownPage}
                pageSize={pageSize}
                total={ordered.length}
                showSizeChanger
                pageSizeOptions={PAGE_SIZES}
                showTotal={(total, [from, to]) => `${from}–${to} / ${total} giải`}
                onChange={(p, size) => {
                  if (size !== pageSize) {
                    setPageSize(size);
                    setPaging({ key: pageKey, page: 1 });
                  } else setPaging({ key: pageKey, page: p });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          )}
        </>
      ) : (
        <Empty description='Chưa có giải đua nào. Nhấn "Đăng ký giải mới" để bắt đầu.'>
          <Button className="rc-primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            Đăng ký giải mới
          </Button>
        </Empty>
      )}

      <RaceEntryForm
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
        loading={createMutation.isPending}
        horseOptions={horseOptions}
        horses={horsesData?.data || []}
        entries={data?.data || []}
        plans={plans}
      />

      <DecisionModal
        entry={decisionRace}
        horse={decisionRace ? horseById.get(refId(decisionRace.horse)) : null}
        plan={decisionRace ? planFor(decisionRace) : null}
        onClose={() => setDecisionRace(null)}
        onDone={() => {
          setDecisionRace(null);
          refresh();
        }}
      />

      <Modal
        title={`Cập nhật kết quả — ${resultRace?.horse?.name || ''} tại ${resultRace?.raceName || ''}`}
        open={Boolean(resultRace)}
        onCancel={() => setResultRace(null)}
        onOk={() => resultForm.submit()}
        okText="Lưu kết quả"
        cancelText="Đóng"
        confirmLoading={resultMutation.isPending}
        destroyOnHidden
      >
        <Form form={resultForm} layout="vertical" onFinish={(values) => resultMutation.mutate({ id: resultRace._id, payload: values })}>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="position" label="Thứ hạng">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="1" />
            </Form.Item>
            <Form.Item name="finishTime" label="Thời gian về đích">
              <Input placeholder="VD: 1:38.50" />
            </Form.Item>
          </div>
          <Form.Item name="prizeMoney" label="Tiền thưởng (₫)" extra="Tự ghi vào doanh thu của chủ ngựa; sửa lại không tạo trùng.">
            <InputNumber
              min={0}
              step={1000000}
              style={{ width: '100%' }}
              formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')}
              parser={(v) => (v ? v.replace(/\./g, '') : '')}
            />
          </Form.Item>
          <Form.Item name="result" label="Ghi chú kết quả" extra="Bỏ trống để hệ thống tự ghi theo thứ hạng và thời gian.">
            <Input placeholder="VD: Về nhất, bứt tốc 200m cuối" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
