import { useState } from 'react';
import { Table, Button, Typography, Tag, Card, Select, Empty, Dropdown, Modal, Progress, Space, Alert, Tooltip } from 'antd';
import {
  PlusOutlined,
  CalendarOutlined,
  ScheduleOutlined,
  DownOutlined,
  FlagOutlined,
} from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { message } from '../../lib/antdStatic';
import { trainingPlanApi } from './trainingApi';
import { horsesApi } from '../horses/horsesApi';
import { raceApi } from '../race/raceApi';
import { useLockedHorseIds } from './useLockedHorses';
import PlanTimeline from './PlanTimeline';
import PlanWizard from './PlanWizard';
import { RaceFormBlock, RaceFormTag } from './RaceForm';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import {
  PHASE_LABELS,
  INTENSITY_LABELS,
  INTENSITY_COLORS,
  SURFACE_LABELS,
  SESSION_KINDS,
  PLAN_STATUS_LABELS,
  PLAN_STATUS_COLORS,
  sessionTimeLabel,
} from './trainingVocab';
import { newestFirst } from '../../utils/newestFirst';

const { Title, Text } = Typography;

const STATUS_CHOICES = {
  active: ['active', 'completed', 'cancelled'],
  draft: ['draft', 'active', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
};

/** "Tuần 10/15 — Tốc độ (tuần 2/3)", or when the cycle hasn't started / is over. */
function whereNow(plan) {
  const p = plan.progress;
  if (!p) return null;
  if (!p.started) return `Bắt đầu ngày ${dayjs(plan.startDate).format('DD/MM/YYYY')}`;
  if (p.ended) return `Đã qua hết ${p.totalWeeks} tuần của kế hoạch`;
  const phase = plan.phases?.[p.phaseIndex];
  return `Tuần ${p.week}/${p.totalWeeks} — ${PHASE_LABELS[plan.phase]}${phase ? ` (tuần ${p.phaseWeek}/${phase.weeks})` : ''}`;
}

function ActivePlanCard({ plan, locked, onGenerate, generating, onStatus, updatingStatus, onOpenSessions }) {
  const p = plan.progress || {};
  const ps = p.phaseSessions || { planned: 0, completed: 0, met: 0 };
  return (
    <Card
      size="small"
      className="h-full border border-[#E4DFD3] hover:border-[#0F5A43]/50 transition-colors bg-[#FFFDF8] rounded-xl shadow-xs"
      styles={{ body: { padding: 20 } }}
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/horses/${plan.horse?._id}`}
                className="text-base font-bold text-emerald-950 hover:text-emerald-700 tracking-tight"
              >
                {plan.horse?.name}
              </Link>
              {locked && (
                <Tag color="red" className="!m-0 inline-flex items-center gap-1 font-semibold text-xs">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Đang khóa
                </Tag>
              )}
              {plan.targetRace && (
                <Tag color="magenta" className="!m-0 inline-flex items-center gap-1 font-medium text-xs">
                  <FlagOutlined className="text-pink-600 shrink-0 text-xs" />
                  <span>{plan.targetRace.raceName} · {dayjs(plan.targetRace.raceDate).format('DD/MM')}</span>
                  {p.raceInDays > 0 ? ` · còn ${p.raceInDays} ngày` : p.raceInDays === 0 ? ' · hôm nay' : ''}
                </Tag>
              )}
            </div>
            <p className="text-xs text-gray-600 m-0 mt-0.5">
              {plan.goal || 'Chưa nêu mục tiêu huấn luyện'}
            </p>
          </div>
          <Select
            size="small"
            value={plan.status}
            disabled={updatingStatus}
            style={{ width: 140 }}
            options={STATUS_CHOICES[plan.status].map((s) => ({ value: s, label: PLAN_STATUS_LABELS[s] }))}
            onChange={(status) => onStatus(plan, status)}
            className="shrink-0"
          />
        </div>

        {/* The card's one focus: the phases of the cycle and where today falls in them. */}
        <PlanTimeline phases={plan.phases} raceDate={plan.targetRace?.raceDate} />
        <span className="text-xs font-semibold text-gray-900">{whereNow(plan)}</span>

        {/* The plan's four figures on one ruled strip. */}
        <dl className="m-0 grid grid-cols-2 gap-y-2.5 border-y border-[#E4DFD3] py-2.5 text-xs sm:grid-cols-4">
          <div className="pr-3">
            <dt className="text-gray-500">Cường độ</dt>
            <dd className="m-0 mt-1">
              <Tag color={INTENSITY_COLORS[plan.intensity]} className="!m-0 font-medium">
                {INTENSITY_LABELS[plan.intensity]}
              </Tag>
            </dd>
          </div>
          <div className="pr-3">
            <dt className="text-gray-500">Khối lượng tuần</dt>
            <dd className="m-0 mt-1 font-semibold tabular-nums text-gray-900">{plan.weeklyVolumeKm} km/tuần</dd>
          </div>
          <div className="pr-3">
            <dt className="text-gray-500">Cự ly &amp; sân</dt>
            <dd className="m-0 mt-1 font-semibold tabular-nums text-gray-900">
              {plan.distanceTarget} m, {SURFACE_LABELS[plan.surface]}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Khung giờ tập</dt>
            <dd className="m-0 mt-1 tabular-nums text-gray-900">
              Sáng {plan.sessionTime || '07:30'}, chiều {plan.afternoonTime || '16:00'}
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Text type="secondary" className="!text-xs font-medium">
              Tiến độ giai đoạn này
            </Text>
            <div className="mt-1.5 flex items-center gap-2">
              <Progress
                percent={ps.planned ? Math.round((ps.completed / ps.planned) * 100) : 0}
                size="small"
                showInfo={false}
                strokeColor="#0F5A43"
                railColor="#EBE5D8"
                className="!m-0 w-24"
              />
              <Text className="!text-sm font-semibold tabular-nums whitespace-nowrap text-gray-900">
                {ps.completed}/{ps.planned} buổi đã tập
              </Text>
            </div>
            <Text type="secondary" className="!text-xs block mt-1">
              {ps.completed ? `${ps.met}/${ps.completed} buổi đạt mục tiêu` : 'Chưa có buổi nào hoàn thành'}
            </Text>
          </div>

          <div>
            <Text type="secondary" className="!text-xs font-medium">
              Buổi sắp tới
            </Text>
            {p.upcoming?.length ? (
              <div className="mt-1 flex flex-col gap-1">
                {p.upcoming.map((s) => (
                  <div key={s._id} className="flex items-center gap-2 text-xs">
                    <Tag color={SESSION_KINDS[s.kind]?.color || 'default'} className="!m-0 !text-[11px]">
                      {SESSION_KINDS[s.kind]?.label || 'Buổi tập'}
                    </Tag>
                    <span className="tabular-nums font-mono text-gray-700">
                      {sessionTimeLabel(s.scheduledAt)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Text type="secondary" className="block !text-xs mt-1">
                Chưa có buổi nào trong 2 tuần tới: kế hoạch bắt đầu muộn hơn, hoặc bác sĩ đang khóa tập.
              </Text>
            )}
          </div>
        </div>

        {/* From the plan's start to today (the whole cycle once over): ready for its race or not. */}
        {p.form && (
          <div className="border-t border-[#E4DFD3] pt-3">
            <RaceFormBlock form={p.form} />
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
          <Space.Compact size="small">
            <Tooltip title="Lịch tuần này và tuần sau được xếp tự động. Bấm để xếp lại các buổi còn trống, kể cả buổi đã hủy.">
              <Button
                type="primary"
                icon={<ScheduleOutlined />}
                loading={generating}
                disabled={locked}
                onClick={() => onGenerate(plan, 'next')}
                className="!h-8 !px-3 font-semibold !bg-[#0F5A43] hover:!bg-[#157356] !border-[#0F5A43]"
              >
                Xếp lại tuần tới
              </Button>
            </Tooltip>
            <Dropdown
              disabled={locked || generating}
              menu={{ items: [{ key: 'this', label: 'Xếp lại tuần này' }], onClick: () => onGenerate(plan, 'this') }}
            >
              <Button
                type="primary"
                icon={<DownOutlined />}
                aria-label="Chọn tuần khác"
                className="!h-8 !bg-[#0F5A43] hover:!bg-[#157356] !border-[#0F5A43]"
              />
            </Dropdown>
          </Space.Compact>
          <Button
            size="small"
            icon={<CalendarOutlined />}
            onClick={() => onOpenSessions(plan)}
            className="!h-8 !px-3 font-semibold !border-[#E5DEC9] hover:!border-[#0F5A43] hover:!text-[#0F5A43]"
          >
            Xem lịch tập
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function TrainingPlanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // "Lập kế hoạch" on a race entry lands here with ?race=<id>: open the wizard for that horse and race.
  const presetRace = searchParams.get('race');
  const [wizardOpen, setWizardOpen] = useState(Boolean(presetRace));
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: plansData, isLoading, isError, error, refetch } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: racesData } = useQuery({ queryKey: ['races'], queryFn: () => raceApi.list() });
  const lockedHorseIds = useLockedHorseIds();
  const plans = plansData?.data || [];
  const active = newestFirst(plans.filter((p) => p.status === 'active'));
  const others = newestFirst(plans.filter((p) => p.status !== 'active'));

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => trainingPlanApi.update(id, { status }),
    onSuccess: (_res, v) => {
      message.success(
        v.status === 'cancelled' || v.status === 'completed'
          ? 'Đã kết thúc kế hoạch — các buổi tập sắp tới của kế hoạch đã được hủy.'
          : 'Đã cập nhật trạng thái kế hoạch.'
      );
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
    },
    onError: (err) => message.error(err.message || 'Cập nhật thất bại.'),
  });

  const generateMutation = useMutation({
    mutationFn: ({ plan, which }) =>
      trainingPlanApi.generateWeek(plan._id, { weekStart: which === 'this' ? dayjs().toISOString() : dayjs().add(7, 'day').toISOString() }),
    onSuccess: (res, { plan }) => {
      const { created = [], skipped = [] } = res.data || {};
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      if (!skipped.length) {
        message.success(`Đã xếp ${created.length} buổi tập cho ${plan.horse?.name}.`);
        return;
      }
      Modal.info({
        title: `Đã xếp ${created.length} buổi tập cho ${plan.horse?.name}`,
        content: (
          <div className="text-sm">
            <div className="mb-1">Các ngày không xếp:</div>
            <ul className="list-disc pl-5">
              {skipped.map((s) => (
                <li key={`${s.date}-${s.slot || s.reason}`}>{s.reason}</li>
              ))}
            </ul>
          </div>
        ),
      });
    },
    onError: (err) => message.error(err.message || 'Không sinh được lịch tuần.'),
  });

  const confirmStatus = (plan, status) => {
    if (status === plan.status) return;
    if (status === 'cancelled' || status === 'completed') {
      Modal.confirm({
        title: status === 'cancelled' ? `Hủy kế hoạch của ${plan.horse?.name}?` : `Kết thúc kế hoạch của ${plan.horse?.name}?`,
        content: 'Các buổi tập đã lên lịch từ hôm nay trở đi sẽ bị hủy. Buổi đã tập vẫn được giữ làm hồ sơ.',
        okText: 'Đồng ý',
        cancelText: 'Không',
        onOk: () => statusMutation.mutateAsync({ id: plan._id, status }),
      });
      return;
    }
    statusMutation.mutate({ id: plan._id, status });
  };

  const historyColumns = [
    { title: 'Ngựa', key: 'horse', render: (_, r) => <Link to={`/horses/${r.horse?._id}`}>{r.horse?.name}</Link> },
    {
      title: 'Mục tiêu',
      key: 'goal',
      render: (_, r) => (
        <div className="min-w-[220px]">
          {r.goal || <Text type="secondary">Chưa nêu mục tiêu</Text>}
          {r.targetRace && (
            <Tag color="magenta" className="!mt-1 !inline-flex items-center gap-1 !w-fit">
              <svg className="w-3 h-3 text-pink-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
              <span>{r.targetRace.raceName} — {dayjs(r.targetRace.raceDate).format('DD/MM/YYYY')}</span>
            </Tag>
          )}
        </div>
      ),
    },
    { title: 'Lộ trình', key: 'phases', render: (_, r) => <div className="w-64"><PlanTimeline phases={r.phases} raceDate={r.targetRace?.raceDate} compact /></div> },
    {
      title: 'Thời gian',
      key: 'dates',
      render: (_, r) => `${dayjs(r.startDate).format('DD/MM/YYYY')} – ${r.endDate ? dayjs(r.endDate).format('DD/MM/YYYY') : '…'}`,
    },
    { title: 'Buổi đã tập', key: 'done', align: 'right', render: (_, r) => <span className="tabular-nums font-medium">{r.progress?.totalCompleted ?? 0}</span> },
    // A draft or a dropped plan has nothing to judge; a finished cycle shows how it went, start to end.
    { title: 'Phong độ cả kỳ', key: 'form', render: (_, r) => (['draft', 'cancelled'].includes(r.status) ? <Text type="secondary">—</Text> : <RaceFormTag form={r.progress?.form} />) },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, r) =>
        STATUS_CHOICES[r.status].length > 1 ? (
          <Select
            size="small"
            value={r.status}
            style={{ width: 150 }}
            options={STATUS_CHOICES[r.status].map((s) => ({ value: s, label: PLAN_STATUS_LABELS[s] }))}
            onChange={(status) => confirmStatus(r, status)}
          />
        ) : (
          <Tag color={PLAN_STATUS_COLORS[r.status]}>{PLAN_STATUS_LABELS[r.status]}</Tag>
        ),
    },
  ];

  const totalActive = active.length;
  const lockedCount = active.filter((p) => lockedHorseIds.has(p.horse?._id)).length;
  const targetRaceCount = active.filter((p) => p.targetRace).length;
  const avgKm = active.length ? Math.round(active.reduce((acc, p) => acc + (p.weeklyVolumeKm || 0), 0) / active.length) : 0;

  return (
    <div>
      <PageHeroBanner
        eyebrow="Huấn luyện & chu kỳ"
        roleLabel="HLV trưởng"
        title="Kế hoạch huấn luyện"
        subtitle="Mỗi ngựa theo một chu kỳ hướng tới giải: Nền tảng → Sức mạnh → Tốc độ → Điểm rơi trước giải, rồi hồi phục. Lịch tập tự xếp sẵn 2 tuần tới; theo dõi tải trọng từng giai đoạn."
        actionButton={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setWizardOpen(true)}
            className="!h-9 !px-4 !rounded-lg !bg-[#D4AF37] hover:!bg-[#E2C058] !border-[#D4AF37] !text-[#061812] font-semibold cursor-pointer"
          >
            Lập kế hoạch mới
          </Button>
        }
      />

      <div className="light-surface-box grid grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E4DFD3] mb-5 rounded-xl bg-[#FAF7F0] border border-[#E5DEC9] shadow-xs overflow-hidden">
        <div className="p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-600">Đang huấn luyện</div>
          <div className="text-xl sm:text-2xl font-bold text-[#0F5A43] tabular-nums mt-1">{totalActive} <span className="text-xs font-normal text-slate-500">ngựa</span></div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-600">Khóa y tế</div>
          <div className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${lockedCount > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
            {lockedCount} <span className="text-xs font-normal text-slate-500">ngựa</span>
          </div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-600">Mục tiêu giải đua</div>
          <div className="text-xl sm:text-2xl font-bold text-amber-700 tabular-nums mt-1">{targetRaceCount} <span className="text-xs font-normal text-slate-500">kế hoạch</span></div>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="text-xs font-medium text-slate-600">Tải trọng trung bình</div>
          <div className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums mt-1">{avgKm} <span className="text-xs font-normal text-slate-500">km/tuần</span></div>
        </div>
      </div>

      {isError && (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          title="Chưa tải được danh sách kế hoạch huấn luyện"
          description={error?.message || 'Không thể lấy dữ liệu kế hoạch lúc này.'}
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      )}

      {isLoading && !plansData ? (
        <Card loading />
      ) : active.length === 0 ? (
        <Card>
          <Empty description='Chưa có ngựa nào đang theo kế hoạch. Bấm "Lập kế hoạch mới" để bắt đầu.'>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setWizardOpen(true)}>
              Lập kế hoạch mới
            </Button>
          </Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {active.map((plan) => (
            <ActivePlanCard
              key={plan._id}
              plan={plan}
              locked={lockedHorseIds.has(plan.horse?._id)}
              generating={generateMutation.isPending && generateMutation.variables?.plan._id === plan._id}
              updatingStatus={statusMutation.isPending && statusMutation.variables?.id === plan._id}
              onGenerate={(p, which) => generateMutation.mutate({ plan: p, which })}
              onStatus={confirmStatus}
              onOpenSessions={(p) => navigate(`/training/sessions?plan=${p._id}`)}
            />
          ))}
        </div>
      )}

      {others.length > 0 && (
        <>
          <Title level={5} className="!mt-8 !mb-2">
            Kế hoạch nháp, đã xong hoặc đã hủy
          </Title>
          <Table
            rowKey="_id"
            size="small"
            columns={historyColumns}
            dataSource={others}
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
          />
        </>
      )}

      <PlanWizard
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          if (presetRace) setSearchParams({});
        }}
        preset={presetRace ? { race: presetRace } : null}
        onCreated={(plan) => plan?._id && navigate(`/training/sessions?plan=${plan._id}&first=1`)}
        horses={horsesData?.data || []}
        races={racesData?.data || []}
        plans={plans}
        lockedHorseIds={lockedHorseIds}
      />
    </div>
  );
}
