import { useState } from 'react';
import { Table, Button, Typography, Tag, Card, Select, Empty, Dropdown, Modal, Space, Alert, Input } from 'antd';
import {
  PlusOutlined,
  CalendarOutlined,
  FlagOutlined,
  SearchOutlined,
  MoreOutlined,
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
import { RaceFormBlock, RaceFormDot, RaceFormTag } from './RaceForm';
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
import { fold } from '../../utils/fold';

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

/** What opens under a plan's row: its goal, its four figures, what comes next and its race form. */
function PlanDetail({ plan }) {
  const p = plan.progress || {};
  return (
    <div className="flex flex-col gap-3 py-1">
      <PlanTimeline phases={plan.phases} raceDate={plan.targetRace?.raceDate} />
      <div className="text-xs text-gray-600">{plan.goal || 'Chưa nêu mục tiêu huấn luyện'}</div>
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
      <div>
        <Text type="secondary" className="!text-xs font-medium">
          Buổi sắp tới
        </Text>
        {p.upcoming?.length ? (
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {p.upcoming.map((s) => (
              <span key={s._id} className="inline-flex items-center gap-2 text-xs">
                <Tag color={SESSION_KINDS[s.kind]?.color || 'default'} className="!m-0 !text-[11px]">
                  {SESSION_KINDS[s.kind]?.label || 'Buổi tập'}
                </Tag>
                <span className="tabular-nums text-gray-600">{sessionTimeLabel(s.scheduledAt)}</span>
              </span>
            ))}
          </div>
        ) : (
          <Text type="secondary" className="block !text-xs mt-1">
            Chưa có buổi nào trong 2 tuần tới: kế hoạch bắt đầu muộn hơn, hoặc bác sĩ đang khóa tập.
          </Text>
        )}
      </div>
      {p.form && <RaceFormBlock form={p.form} />}
    </div>
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

  const [search, setSearch] = useState('');
  const shownActive = active.filter((p) => !search.trim() || fold(p.horse?.name).includes(fold(search.trim())));
  // One line per horse in four columns, so it fits a laptop screen: the horse (its race form a dot),
  // where it is in its cycle and how the phase is going, what comes next, and the actions.
  const activeColumns = [
    {
      title: 'Ngựa',
      key: 'horse',
      render: (_, r) => (
        <div className="flex max-w-[240px] items-center gap-1.5">
          <RaceFormDot form={r.progress?.form} />
          <Link to={`/horses/${r.horse?._id}`} className="truncate font-semibold" title={r.horse?.name}>
            {r.horse?.name}
          </Link>
          {lockedHorseIds.has(r.horse?._id) && <span className="shrink-0 text-[11px] font-medium text-rose-700">Đang khóa</span>}
        </div>
      ),
    },
    {
      title: 'Đang ở',
      key: 'where',
      render: (_, r) => {
        const ps = r.progress?.phaseSessions || { planned: 0, completed: 0, met: 0 };
        return (
          <div className="w-48">
            <PlanTimeline phases={r.phases} raceDate={r.targetRace?.raceDate} compact />
            <div className="mt-0.5 truncate text-[11px] text-gray-600" title={whereNow(r)}>
              {whereNow(r)}
            </div>
            <div className="text-[11px] tabular-nums text-gray-500">
              Giai đoạn này: {ps.completed}/{ps.planned} buổi{ps.completed ? `, đạt ${ps.met}` : ''}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Sắp tới',
      key: 'next',
      render: (_, r) => {
        const s = r.progress?.upcoming?.[0];
        const race = r.targetRace;
        return (
          <div className="max-w-[200px] text-xs">
            {s ? (
              <div className="truncate text-gray-900">
                {SESSION_KINDS[s.kind]?.short || SESSION_KINDS[s.kind]?.label || 'Buổi tập'} <span className="tabular-nums text-gray-500">{sessionTimeLabel(s.scheduledAt)}</span>
              </div>
            ) : (
              <div className="text-gray-500">Chưa có buổi trong 2 tuần tới</div>
            )}
            {race && (
              <div className="truncate text-pink-700" title={`${race.raceName}, ${dayjs(race.raceDate).format('DD/MM/YYYY')}`}>
                <FlagOutlined className="mr-1" />
                {race.raceName}
                {r.progress?.raceInDays > 0 ? `, còn ${r.progress.raceInDays} ngày` : r.progress?.raceInDays === 0 ? ', hôm nay' : ''}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      render: (_, r) => {
        const locked = lockedHorseIds.has(r.horse?._id);
        const generating = generateMutation.isPending && generateMutation.variables?.plan._id === r._id;
        // Ending or dropping a plan is rare: it waits behind "⋯" with the week booking.
        const items = [
          { key: 'next', label: 'Xếp lại tuần tới', disabled: locked },
          { key: 'this', label: 'Xếp lại tuần này', disabled: locked },
          { type: 'divider' },
          ...STATUS_CHOICES[r.status].filter((s) => s !== r.status).map((s) => ({ key: `status:${s}`, label: s === 'completed' ? 'Kết thúc kế hoạch' : s === 'cancelled' ? 'Hủy kế hoạch' : PLAN_STATUS_LABELS[s], danger: s === 'cancelled' })),
        ];
        return (
          <Space size={4}>
            <Button size="small" icon={<CalendarOutlined />} onClick={() => navigate(`/training/sessions?plan=${r._id}`)}>
              Lịch tập
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{
                items,
                onClick: ({ key }) => (key.startsWith('status:') ? confirmStatus(r, key.slice(7)) : generateMutation.mutate({ plan: r, which: key })),
              }}
            >
              <Button size="small" type="text" icon={<MoreOutlined />} loading={generating || (statusMutation.isPending && statusMutation.variables?.id === r._id)} aria-label={`Thao tác khác với kế hoạch của ${r.horse?.name}`} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

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
        stats={[
          { label: 'Đang huấn luyện', value: `${totalActive} ngựa` },
          { label: 'Khóa y tế', value: <span className={lockedCount > 0 ? 'text-rose-300' : ''}>{lockedCount} ngựa</span> },
          { label: 'Có giải mục tiêu', value: `${targetRaceCount} kế hoạch` },
          { label: 'Tải trọng trung bình', value: `${avgKm} km/tuần` },
        ]}
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
        <Card className="!rounded-xl !border-[#E2D9C8]" styles={{ body: { padding: 0 } }}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="text-[15px] font-semibold text-gray-900">Đang áp dụng</span>
            <Input allowClear prefix={<SearchOutlined className="text-gray-400" />} placeholder="Tìm ngựa" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-48" aria-label="Tìm ngựa trong kế hoạch" />
          </div>
          <Table
            rowKey="_id"
            size="small"
            columns={activeColumns}
            dataSource={shownActive}
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
            expandable={{ expandedRowRender: (plan) => <PlanDetail plan={plan} />, expandRowByClick: false }}
            locale={{ emptyText: `Không có ngựa nào tên “${search}”.` }}
          />
        </Card>
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
