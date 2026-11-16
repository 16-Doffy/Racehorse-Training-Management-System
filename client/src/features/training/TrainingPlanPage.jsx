import { useEffect, useState } from 'react';
import { Table, Button, Typography, Tag, Card, Select, Empty, Modal, Alert, Input, Collapse } from 'antd';
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
import PlanFocusPanel, { whereNow } from './PlanFocusPanel';
import PlanWizard from './PlanWizard';
import { RaceFormDot, RaceFormTag } from './RaceForm';
import { PhaseWeekEditor, withParts } from './weekTemplate';
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
  formFigures,
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

/**
 * The week templates of a running plan, changed and saved: the sessions ahead it booked itself and the
 * trainer has not changed are booked again from the new weeks (server: trainingPlan.controller updatePlan).
 */
function WeekTemplateModal({ plan, startPhase = 0, onClose }) {
  const queryClient = useQueryClient();
  const [phases, setPhases] = useState(() =>
    (plan.phases || []).map((p) => ({
      key: p.key,
      weeks: p.weeks,
      // Days added for an illness or a checkpoint (or taken off to keep the race) stay as they are.
      extraDays: p.extraDays || 0,
      weeklyVolumeKm: p.weeklyVolumeKm,
      intensity: p.intensity,
      surface: p.surface,
      ...(p.distanceTarget ? { distanceTarget: p.distanceTarget } : {}),
      week: (p.week || []).map(withParts),
    }))
  );
  const [tab, setTab] = useState(startPhase);
  const save = useMutation({
    mutationFn: () => trainingPlanApi.update(plan._id, { phases }),
    onSuccess: () => {
      message.success('Đã lưu tuần mẫu — các buổi sắp tới được xếp lại theo tuần mới.');
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['feeding'] });
      onClose();
    },
    onError: (err) => message.error(err.message || 'Không lưu được tuần mẫu.'),
  });
  return (
    <Modal
      open
      width={1120}
      title={`Tuần mẫu — ${plan.horse?.name || 'Ngựa'}${plan.targetRace?.raceName ? ` · ${plan.targetRace.raceName}` : ''}`}
      onCancel={onClose}
      okText="Lưu tuần mẫu"
      cancelText="Hủy"
      confirmLoading={save.isPending}
      onOk={() => save.mutate()}
      destroyOnHidden
    >
      <Text type="secondary" className="mb-3 block !text-sm">
        Chọn bài cho từng buổi của mỗi giai đoạn. Lưu xong, các buổi sắp tới hệ thống tự xếp được xếp lại theo tuần mới; buổi HLV đã đổi tay giữ nguyên.
      </Text>
      <PhaseWeekEditor
        phases={phases}
        onChange={setPhases}
        phaseIndex={tab}
        onPhaseIndex={setTab}
        sessionTime={plan.sessionTime}
        afternoonTime={plan.afternoonTime}
        guideDistance={plan.targetRace?.distance || plan.distanceTarget}
        ranges={(plan.phases || []).map((p) => (p.startDate ? { start: p.startDate, end: p.endDate } : null))}
      />
    </Modal>
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
  const selectedPlanId = searchParams.get('plan');
  const selectPlan = (id) => setSearchParams(id ? { plan: id } : {}, { replace: true });
  // The week templates being edited: { plan, phase }.
  const [weekEdit, setWeekEdit] = useState(null);
  const shownActive = active.filter((p) => !search.trim() || fold(p.horse?.name).includes(fold(search.trim())));
  const selectedPlan = plans.find((p) => p._id === selectedPlanId) || shownActive[0];
  useEffect(() => {
    if (searchParams.get('week') !== 'edit' || !selectedPlan) return;
    setWeekEdit({ plan: selectedPlan, phase: selectedPlan.progress?.started && !selectedPlan.progress?.ended ? selectedPlan.progress.phaseIndex : 0 });
    setSearchParams({ plan: selectedPlan._id }, { replace: true });
  }, [searchParams, selectedPlan, setSearchParams]);
  const menuFor = (r) => {
    const locked = lockedHorseIds.has(r.horse?._id);
    return [
      { key: 'this', label: 'Xếp lại tuần này', disabled: locked },
      { key: 'next', label: 'Xếp lại tuần tới', disabled: locked },
      { type: 'divider' },
      ...STATUS_CHOICES[r.status].filter((st) => st !== r.status).map((st) => ({ key: `status:${st}`, label: st === 'completed' ? 'Kết thúc kế hoạch' : st === 'cancelled' ? 'Hủy kế hoạch' : PLAN_STATUS_LABELS[st], danger: st === 'cancelled' })),
    ];
  };
  const onMenu = (r, key) => (key.startsWith('status:') ? confirmStatus(r, key.slice(7)) : generateMutation.mutate({ plan: r, which: key }));
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
    { title: 'Lộ trình', key: 'phases', render: (_, r) => <div className="w-64"><PlanTimeline phases={r.phases} raceDate={r.targetRace?.raceDate} mini /></div> },
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
  const raceReadyCount = active.filter((p) => p.progress?.form?.status === 'ready').length;
  const targetRaceCount = active.filter((p) => p.targetRace).length;

  return (
    <div>
      <PageHeroBanner
        eyebrow="Huấn luyện & chu kỳ"
        roleLabel="HLV trưởng"
        title="Kế hoạch huấn luyện"
        stats={[
          { label: 'Đang huấn luyện', value: `${totalActive} ngựa` },
          { label: 'Đủ điều kiện dự giải', value: <span className={raceReadyCount > 0 ? 'text-emerald-700 font-semibold' : ''}>{raceReadyCount}/{totalActive} ngựa</span> },
          { label: 'Khóa y tế', value: <span className={lockedCount > 0 ? 'text-rose-700 font-semibold' : ''}>{lockedCount} ngựa</span> },
          { label: 'Có giải mục tiêu', value: `${targetRaceCount} kế hoạch` },
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
        <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="light-surface-box overflow-hidden rounded-xl border border-gray-200 bg-white lg:sticky lg:top-4" aria-label="Ngựa đang theo kế hoạch">
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
              <span className="text-sm font-semibold text-gray-900">
                Đang áp dụng <span className="font-normal text-gray-500">· {active.length}</span>
              </span>
              <Input size="small" allowClear prefix={<SearchOutlined className="text-gray-400" />} placeholder="Tìm ngựa" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-36" aria-label="Tìm ngựa trong kế hoạch" />
            </div>
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
              {shownActive.map((r) => {
                const on = selectedPlan?._id === r._id;
                const p = r.progress || {};
                const phase = r.phases?.[p.phaseIndex];
                const share = p.totalWeeks ? Math.min(1, Math.max(0, (p.week || 0) / p.totalWeeks)) : 0;
                return (
                  <button
                    key={r._id}
                    type="button"
                    onClick={() => selectPlan(r._id)}
                    aria-pressed={on}
                    className={`block w-full cursor-pointer border-0 border-b border-gray-100 px-3 py-2.5 text-left ${on ? 'bg-amber-50/60 shadow-[inset_3px_0_0_#D4AF37]' : 'bg-transparent hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <RaceFormDot form={p.form} />
                        <span className="truncate text-sm font-semibold text-gray-900">{r.horse?.name}</span>
                      </span>
                      {lockedHorseIds.has(r.horse?._id) ? <span className="shrink-0 text-[11px] font-medium text-rose-700">Khóa tập</span> : <RaceFormTag form={p.form} />}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                      <span className="truncate">
                        {p.started && !p.ended ? `${PHASE_LABELS[r.phase] || r.phase}${phase ? ` · tuần ${p.phaseWeek}/${phase.weeks}` : ''}` : whereNow(r)}
                      </span>
                      {r.targetRace && p.raceInDays >= 0 && (
                        <span className="shrink-0 text-pink-700">
                          <FlagOutlined className="mr-0.5" />
                          {p.raceInDays === 0 ? 'hôm nay' : `${p.raceInDays} ngày`}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-gray-400" style={{ width: `${Math.round(share * 100)}%` }} />
                    </div>
                  </button>
                );
              })}
              {!shownActive.length && <div className="px-3 py-4 text-sm text-gray-500">Không có ngựa nào tên “{search}”.</div>}
            </div>
          </aside>
          {selectedPlan && (
            <PlanFocusPanel
              key={selectedPlan._id}
              plan={selectedPlan}
              locked={lockedHorseIds.has(selectedPlan.horse?._id)}
              onEditWeek={(phase) => setWeekEdit({ plan: selectedPlan, phase })}
              menuItems={['draft', 'active'].includes(selectedPlan.status) ? menuFor(selectedPlan) : []}
              onMenu={(key) => onMenu(selectedPlan, key)}
              busy={(generateMutation.isPending && generateMutation.variables?.plan._id === selectedPlan._id) || (statusMutation.isPending && statusMutation.variables?.id === selectedPlan._id)}
            />
          )}
        </div>
      )}

      {others.length > 0 && (
        <Collapse
          className="!mt-6"
          items={[
            {
              key: 'history',
              label: <span className="text-sm font-medium">Kế hoạch nháp, đã xong hoặc đã hủy · {others.length}</span>,
              children: (
                <Table
                  rowKey="_id"
                  size="small"
                  columns={historyColumns}
                  dataSource={others}
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 8, hideOnSinglePage: true }}
                  onRow={(r) => ({ onClick: () => selectPlan(r._id), className: 'cursor-pointer' })}
                />
              ),
            },
          ]}
        />
      )}

      {weekEdit && <WeekTemplateModal plan={weekEdit.plan} startPhase={weekEdit.phase} onClose={() => setWeekEdit(null)} />}

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
