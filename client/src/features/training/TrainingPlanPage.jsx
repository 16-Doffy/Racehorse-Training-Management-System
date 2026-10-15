import { useState } from 'react';
import { Table, Button, Typography, Tag, Card, Select, Empty, Dropdown, Modal, Progress, Space } from 'antd';
import { PlusOutlined, CalendarOutlined, ScheduleOutlined, DownOutlined } from '@ant-design/icons';
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

function ActivePlanCard({ plan, locked, onGenerate, generating, onStatus, onOpenSessions }) {
  const p = plan.progress || {};
  const ps = p.phaseSessions || { planned: 0, completed: 0, met: 0 };
  return (
    <Card size="small" className="h-full border border-[#E4DFD3] hover:border-[#0F5A43]/50 transition-colors bg-[#FFFDF8] rounded-xl shadow-xs" styles={{ body: { padding: 18 } }}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/horses/${plan.horse?._id}`} className="text-base font-semibold">
                {plan.horse?.name}
              </Link>
              {locked && (
                <Tag color="red" className="!m-0 inline-flex items-center gap-1 font-medium">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Đang khóa
                </Tag>
              )}
              {plan.targetRace && (
                <Tag color="magenta" className="!m-0 inline-flex items-center gap-1 font-medium">
                  <svg className="w-3 h-3 text-pink-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                  <span>{plan.targetRace.raceName} · {dayjs(plan.targetRace.raceDate).format('DD/MM')}</span>
                  {p.raceInDays > 0 ? ` · còn ${p.raceInDays} ngày` : p.raceInDays === 0 ? ' · hôm nay' : ''}
                </Tag>
              )}
            </div>
            <Text type="secondary" className="!text-sm">
              {plan.goal || 'Chưa nêu mục tiêu'}
            </Text>
          </div>
          <Select
            size="small"
            value={plan.status}
            style={{ width: 150 }}
            options={STATUS_CHOICES[plan.status].map((s) => ({ value: s, label: PLAN_STATUS_LABELS[s] }))}
            onChange={(status) => onStatus(plan, status)}
          />
        </div>

        <PlanTimeline phases={plan.phases} raceDate={plan.targetRace?.raceDate} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text strong>{whereNow(plan)}</Text>
          <Space size={4} wrap>
            <Tag color={INTENSITY_COLORS[plan.intensity]} className="!m-0">
              Cường độ {INTENSITY_LABELS[plan.intensity]}
            </Tag>
            <Tag className="!m-0">{plan.weeklyVolumeKm} km/tuần</Tag>
            <Tag className="!m-0">Cự ly thi đấu {plan.distanceTarget}m</Tag>
            <Tag className="!m-0">Sáng {plan.sessionTime || '07:30'} · Chiều {plan.afternoonTime || '16:00'} (nếu có)</Tag>
            <Tag className="!m-0">{SURFACE_LABELS[plan.surface]}</Tag>
          </Space>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Text type="secondary" className="!text-xs uppercase tracking-wide">
              Giai đoạn này
            </Text>
            <div className="mt-1 flex items-center gap-2">
              <Progress
                percent={ps.planned ? Math.round((ps.completed / ps.planned) * 100) : 0}
                size="small"
                showInfo={false}
                strokeColor="#0F5A43"
                className="!m-0 w-24"
              />
              <Text className="!text-sm tabular-nums whitespace-nowrap">
                {ps.completed}/{ps.planned} buổi đã tập
              </Text>
            </div>
            <Text type="secondary" className="!text-xs">
              {ps.completed ? `${ps.met}/${ps.completed} buổi đạt mục tiêu` : 'Chưa có buổi nào hoàn thành'}
            </Text>
          </div>
          <div>
            <Text type="secondary" className="!text-xs uppercase tracking-wide">
              Sắp tới
            </Text>
            {p.upcoming?.length ? (
              <div className="mt-1 flex flex-col gap-1">
                {p.upcoming.map((s) => (
                  <div key={s._id} className="flex items-center gap-2 text-sm">
                    <Tag color={SESSION_KINDS[s.kind]?.color || 'default'} className="!m-0">
                      {SESSION_KINDS[s.kind]?.label || 'Buổi tập'}
                    </Tag>
                    <Text type="secondary" className="!text-xs tabular-nums">
                      {sessionTimeLabel(s.scheduledAt)}
                    </Text>
                  </div>
                ))}
              </div>
            ) : (
              <Text type="secondary" className="block !text-xs mt-1">
                Chưa xếp buổi nào — bấm &quot;Sinh lịch tuần&quot;.
              </Text>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Space.Compact size="small">
            <Button type="primary" icon={<ScheduleOutlined />} loading={generating} disabled={locked} onClick={() => onGenerate(plan, 'next')}>
              Sinh lịch tuần tới
            </Button>
            <Dropdown
              disabled={locked || generating}
              menu={{ items: [{ key: 'this', label: 'Sinh lịch tuần này' }], onClick: () => onGenerate(plan, 'this') }}
            >
              <Button type="primary" icon={<DownOutlined />} aria-label="Chọn tuần khác" />
            </Dropdown>
          </Space.Compact>
          <Button size="small" icon={<CalendarOutlined />} onClick={() => onOpenSessions(plan)}>
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

  const { data: plansData, isLoading } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: racesData } = useQuery({ queryKey: ['races'], queryFn: () => raceApi.list() });
  const lockedHorseIds = useLockedHorseIds();
  const plans = plansData?.data || [];
  const active = plans.filter((p) => p.status === 'active');
  const others = plans.filter((p) => p.status !== 'active');

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
    { title: 'Buổi đã tập', key: 'done', render: (_, r) => r.progress?.totalCompleted ?? 0 },
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
        eyebrow="TEAM 8 • KẾ HOẠCH & GIÁO ÁN HUẤN LUYỆN"
        roleLabel="Head Trainer"
        title="Kế Hoạch Huấn Luyện & Chu Kỳ Phong Độ"
        subtitle="Mỗi ngựa theo một chu kỳ hướng tới giải: Nền tảng → Sức mạnh → Tốc độ → Điểm rơi trước giải, rồi hồi phục. Xếp lịch buổi tập và kiểm soát tải trọng tuần."
        stats={[
          { label: 'Đang huấn luyện', value: `${totalActive} con` },
          { label: 'Khóa y tế', value: `${lockedCount} con` },
          { label: 'Mục tiêu giải đua', value: `${targetRaceCount} kế hoạch` },
          { label: 'Tải trung bình', value: `${avgKm} km/tuần` },
        ]}
        actionButton={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setWizardOpen(true)}
            className="!h-10 !px-4 !rounded-xl !bg-gradient-to-r !from-amber-600 !to-amber-700 hover:!from-amber-500 hover:!to-amber-600 !border-amber-400/40 !text-white font-semibold cursor-pointer shadow-md"
          >
            Lập kế hoạch mới
          </Button>
        }
      />

      {/* KPI Ribbon - Mẫu 1 Prestige British Racing */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5 p-3 rounded-xl bg-white border border-[#E4DFD3] shadow-xs">
        <div className="px-3 py-1.5 border-r border-[#E4DFD3] last:border-r-0">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Đang Huấn Luyện</div>
          <div className="text-xl font-bold text-[#0F5A43] tabular-nums mt-0.5">{totalActive} <span className="text-xs font-normal text-slate-500">ngựa</span></div>
        </div>
        <div className="px-3 py-1.5 border-r border-[#E4DFD3] last:border-r-0">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Khóa Y Tế</div>
          <div className={`text-xl font-bold tabular-nums mt-0.5 ${lockedCount > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
            {lockedCount} <span className="text-xs font-normal text-slate-500">ngựa</span>
          </div>
        </div>
        <div className="px-3 py-1.5 border-r border-[#E4DFD3] last:border-r-0">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mục Tiêu Giải Đua</div>
          <div className="text-xl font-bold text-amber-600 tabular-nums mt-0.5">{targetRaceCount} <span className="text-xs font-normal text-slate-500">kế hoạch</span></div>
        </div>
        <div className="px-3 py-1.5">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tải Trọng Trung Bình</div>
          <div className="text-xl font-bold text-slate-800 tabular-nums mt-0.5">{avgKm} <span className="text-xs font-normal text-slate-500">km/tuần</span></div>
        </div>
      </div>

      {isLoading ? (
        <Card loading />
      ) : active.length === 0 ? (
        <Card>
          <Empty description='Chưa có ngựa nào đang theo kế hoạch. Bấm "Lập kế hoạch mới" để bắt đầu.' />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {active.map((plan) => (
            <ActivePlanCard
              key={plan._id}
              plan={plan}
              locked={lockedHorseIds.has(plan.horse?._id)}
              generating={generateMutation.isPending && generateMutation.variables?.plan._id === plan._id}
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
