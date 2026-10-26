import { useState } from 'react';
import { Table, Tag, Typography, Button, Modal, Form, Input, Select, Alert, Empty, Tooltip, Popconfirm, Segmented, Grid } from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, EditOutlined, DownloadOutlined, DeleteOutlined, RollbackOutlined, SearchOutlined } from '@ant-design/icons';
import { downloadFile } from '../../lib/files';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { newestFirst } from '../../utils/newestFirst';
import { horsesApi } from './horsesApi';
import { usersApi } from '../admin/usersApi';
import { stableAssignmentApi, stallApi } from '../stable/stableApi';
import { ROLES } from '../../constants/roles';
import { HEALTH_LABELS, HEALTH_COLORS, TRAINING_LEVEL_META } from '../../constants/health';
import HorseNextStep from './HorseNextStep';
import { HORSE_SEX_LABELS } from '../../constants/horse';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import HorseFormModal from './HorseFormModal';
import { fold } from '../../utils/fold';
import { trainingPlanApi } from '../training/trainingApi';
import { PHASE_SHORT, SESSION_KINDS, sessionTimeLabel } from '../training/trainingVocab';

const { Title, Text } = Typography;

/** "4 tuổi", or "7 tháng" for a horse under a year; null without a date of birth. */
function ageOf(dob) {
  if (!dob) return null;
  const years = dayjs().diff(dayjs(dob), 'year');
  return years > 0 ? `${years} tuổi` : `${dayjs().diff(dayjs(dob), 'month')} tháng`;
}

/** One line of who looks after the horse: the role, then the name — or the gap, for the Manager to fill. */
function Person({ label, name, gap }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 text-[13px] leading-5">
      <Text type="secondary" className="!w-[30px] shrink-0 !text-[11px] uppercase tracking-wide">
        {label}
      </Text>
      {name ? (
        <span className="truncate font-medium" title={name}>
          {name}
        </span>
      ) : gap ? (
        <Text type="danger" className="!text-[12.5px]">
          Chưa gán
        </Text>
      ) : (
        <Text type="secondary">—</Text>
      )}
    </div>
  );
}

export default function HorseListPage() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  // Creating/editing a horse and assigning who is responsible for it is the Club Manager's job
  // (POST/PUT /horses is Manager-only on the server); every other role sees the same read-only
  // roster they always had.
  const isManager = user?.role === ROLES.MANAGER;
  // The Horse Owner has their own list (features/owner/OwnerHorses.jsx).
  // The Manager and the trainer run a horse from arrival to training: they see its next step.
  const showsNextStep = [ROLES.MANAGER, ROLES.HEAD_TRAINER].includes(user?.role);
  // A wide screen gets more of each horse on its line (age and weight, then owner and vet) rather than
  // an empty middle; a laptop keeps only the columns that fit it.
  const screens = Grid.useBreakpoint();
  const showAge = isManager ? screens.xxl : screens.xl;
  const showPeople = !isManager && screens.xxl;
  // The trainer's plan for each horse: where it is in its cycle and its next session.
  const showPlan = user?.role === ROLES.HEAD_TRAINER && screens.xxl;

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState('all');

  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const horses = data?.data || [];
  const { data: checklistData } = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists(), enabled: showsNextStep });
  const checklistByHorse = new Map((checklistData?.data || []).map((c) => [String(c.horse._id), c]));
  // The stall of each horse, from the stable map (a horse still on a free-text stall shows that text).
  const { data: stallsData } = useQuery({ queryKey: ['stalls'], queryFn: () => stallApi.map(), enabled: showsNextStep });
  const stallByHorse = new Map([
    ...(stallsData?.data?.unplaced || []).map((u) => [String(u.horse._id), u.stableBlock]),
    ...(stallsData?.data?.stalls || []).filter((st) => st.occupant?.horse).map((st) => [String(st.occupant.horse._id), st.code]),
  ]);
  const mapStalls = stallsData?.data?.stalls || [];
  const { data: plansData } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list(), enabled: Boolean(showPlan) });
  const planByHorse = new Map((plansData?.data || []).filter((p) => p.status === 'active').map((p) => [String(p.horse?._id || p.horse), p]));
  // Has a vet examined the horse? true / false, or undefined while that is still loading.
  const examined = (h) => checklistByHorse.get(String(h._id))?.items?.find((i) => i.key === 'health')?.done;

  // Manager: horses the club no longer manages, kept for their records.
  const [view, setView] = useState('active');
  const { data: archivedData, isLoading: archivedLoading } = useQuery({
    queryKey: ['horses', 'archived'],
    queryFn: () => horsesApi.list({ archived: 'true' }),
    enabled: isManager && view === 'archived',
  });
  const archivedHorses = archivedData?.data || [];
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveReason, setArchiveReason] = useState('');
  const refreshHorses = () => queryClient.invalidateQueries({ queryKey: ['horses'] });

  const deleteMutation = useMutation({
    mutationFn: (horse) => horsesApi.remove(horse._id),
    onSuccess: () => {
      message.success('Đã xoá ngựa.');
      refreshHorses();
    },
    // A horse with records can't be deleted; the server says so and the Manager can stop
    // managing it instead.
    onError: (err, horse) => {
      if (err.status === 409 && err.data?.canArchive) {
        setArchiveTarget({ ...horse, blockedReason: err.message });
      } else {
        message.error(err.message || 'Xoá thất bại.');
      }
    },
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, reason }) => horsesApi.archive(id, { reason }),
    onSuccess: (res) => {
      message.success(res.message || 'Đã ngừng quản lý ngựa.');
      setArchiveTarget(null);
      setArchiveReason('');
      refreshHorses();
    },
    onError: (err) => message.error(err.message || 'Thao tác thất bại.'),
  });
  const unarchiveMutation = useMutation({
    mutationFn: (horse) => horsesApi.unarchive(horse._id),
    onSuccess: (res) => {
      message.success(res.message || 'Đã khôi phục.');
      refreshHorses();
    },
    onError: (err) => message.error(err.message || 'Khôi phục thất bại.'),
  });

  // A horse with an empty slot is invisible to whoever should have been in it — no owner means
  // its owner can't follow it, no trainer means no one plans its training, no vet means no one
  // watches its health. Only the Manager can see the gap, so only the Manager can close it.
  const hasGap = (h) => !h.owner || !h.assignedTrainer || !h.assignedVet;
  const incomplete = isManager ? horses.filter(hasGap) : [];

  // Counted the way the dashboard counts them. A new horse is "eligible" in the record before any vet
  // has seen it, so "ready" also needs an exam on file and no medical restriction; an unexamined horse
  // is counted on its own rather than as healthy.
  const checkItem = (h, key) => checklistByHorse.get(String(h._id))?.items?.find((i) => i.key === key)?.done;
  const isReady = (h) => h.healthStatus === 'eligible' && checkItem(h, 'health') && checkItem(h, 'clearance');
  const needsWatch = (h) => ['monitoring', 'injured', 'quarantined'].includes(h.healthStatus) || h.trainingClearance?.restricted;
  // The Manager closes staffing gaps; the trainer closes planning gaps.
  const isGap = (h) => (isManager ? hasGap(h) : checkItem(h, 'plan') === false);
  const readyCount = horses.filter(isReady).length;
  const unexaminedCount = horses.filter((h) => examined(h) === false).length;
  const restrictedCount = horses.filter((h) => h.trainingClearance?.restricted).length;
  const watchCount = horses.filter(needsWatch).length;
  const gapCount = horses.filter(isGap).length;

  // Assignee dropdowns — only fetched for the Manager, who is the only role that can assign.
  const { data: trainersData } = useQuery({
    queryKey: ['users', ROLES.HEAD_TRAINER],
    queryFn: () => usersApi.list({ role: ROLES.HEAD_TRAINER }),
    enabled: isManager,
  });
  const { data: vetsData } = useQuery({
    queryKey: ['users', ROLES.VETERINARIAN],
    queryFn: () => usersApi.list({ role: ROLES.VETERINARIAN }),
    enabled: isManager,
  });
  const { data: ownersData } = useQuery({
    queryKey: ['users', ROLES.OWNER],
    queryFn: () => usersApi.list({ role: ROLES.OWNER }),
    enabled: isManager,
  });
  // A new horse goes straight into a stall, with its groom.
  const { data: groomsData } = useQuery({
    queryKey: ['users', ROLES.GROOM],
    queryFn: () => usersApi.list({ role: ROLES.GROOM }),
    enabled: isManager,
  });
  const grooms = (groomsData?.data || []).filter((u) => u.isActive !== false);

  const activeOptions = (res) =>
    (res?.data || [])
      .filter((u) => u.isActive)
      .map((u) => ({ value: u._id, label: u.name }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['horses'] });

  const saveMutation = useMutation({
    mutationFn: async ({ stall, caretaker, ...payload }) => {
      if (editTarget) return { horse: (await horsesApi.update(editTarget._id, payload)).data };
      const horse = (await horsesApi.create(payload)).data;
      if (!stall) return { horse };
      // The horse exists from here on. A stall someone took in the meantime leaves it without a stall
      // (said below, placed from the Chuồng column), never makes the Manager create it twice.
      try {
        await stableAssignmentApi.upsert({ horse: horse._id, stall, assignedCaretaker: caretaker || undefined });
        return { horse, stall: mapStalls.find((s) => s._id === stall) };
      } catch (placeError) {
        return { horse, placeError };
      }
    },
    onSuccess: ({ horse, stall, placeError }) => {
      if (editTarget) message.success('Đã cập nhật hồ sơ ngựa.');
      else if (placeError) message.warning(`Đã thêm ${horse?.name || 'ngựa'} nhưng chưa xếp được chuồng: ${placeError.message || 'lỗi không rõ'}. Bấm vào ô Chuồng của ngựa để xếp lại.`, 8);
      else if (stall) message.success(`Đã thêm ${horse?.name || 'ngựa'} vào chuồng ${stall.code}.`);
      else message.success('Đã thêm ngựa mới.');
      invalidate();
      if (stall || placeError) {
        queryClient.invalidateQueries({ queryKey: ['stalls'] });
        queryClient.invalidateQueries({ queryKey: ['stable-assignments'] });
      }
      setFormOpen(false);
      setEditTarget(null);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Lưu thất bại.'),
  });

  const openCreate = () => {
    setEditTarget(null);
    form.resetFields();
    setFormOpen(true);
  };

  const openEdit = (record) => {
    setEditTarget(record);
    form.setFieldsValue({
      name: record.name,
      breed: record.breed,
      color: record.color,
      dob: record.dob ? dayjs(record.dob) : null,
      weightKg: record.weightKg,
      sex: record.sex,
      microchipNumber: record.microchipNumber,
      registrationNumber: record.registrationNumber,
      valuationVnd: record.valuationVnd ?? null,
      owner: record.owner?._id || record.owner,
      assignedTrainer: record.assignedTrainer?._id || record.assignedTrainer,
      assignedVet: record.assignedVet?._id || record.assignedVet,
    });
    setFormOpen(true);
  };

  const archived = view === 'archived';
  const stallCell = (h) => {
    const code = stallByHorse.get(String(h._id));
    // The Manager places horses: the cell opens that horse's stall form on the stable page.
    if (isManager) {
      return (
        <Button
          size="small"
          type={code ? 'default' : 'dashed'}
          className="!max-w-full tabular-nums !font-semibold"
          title={code}
          onClick={(e) => {
            e.stopPropagation(); // not the row's click, which opens the horse
            navigate(`/admin/stables?horse=${h._id}`);
          }}
        >
          <span className="min-w-0 truncate">{code || 'Xếp chuồng'}</span>
        </Button>
      );
    }
    // A horse not yet on the map shows its free-text stall, which can be long: cut, the whole in its title.
    return code ? (
      <Tag className="!m-0 !inline-block !max-w-full truncate align-middle tabular-nums" title={code}>
        {code}
      </Tag>
    ) : (
      <Tag className="!m-0">Chưa xếp</Tag>
    );
  };

  // A handful of columns, each answering one question — who the horse is, how it is, who looks
  // after it, what comes next — so the list fits the page instead of scrolling sideways. Every column
  // but the next step has its width; the next step, the longest to say, takes what is left.
  const columns = [
    {
      title: 'Ngựa',
      key: 'horse',
      // Fixed beside the next step, which takes the rest; on its own (archived, other roles) it stretches.
      width: showsNextStep && !archived ? (isManager ? 220 : 240) : undefined,
      render: (_, h) => (
        <div className="min-w-0">
          <div className="truncate font-semibold" title={h.name}>
            {h.name}
          </div>
          <Text type="secondary" className="block truncate !text-xs" title={[h.breed, HORSE_SEX_LABELS[h.sex], h.color].filter(Boolean).join(' · ')}>
            {[h.breed, HORSE_SEX_LABELS[h.sex], h.color].filter(Boolean).join(' · ') || 'Chưa có lý lịch'}
          </Text>
          {/* Roles other than the Manager only see their own horses: the owner is all they need here, on a small line. */}
          {!isManager && !showPeople && <Text type="secondary" className="block truncate !text-xs">Chủ: {h.owner?.name || 'CLB sở hữu'}</Text>}
        </div>
      ),
    },
  ];
  if (showAge) {
    columns.push({
      title: 'Tuổi · cân nặng',
      key: 'age',
      width: 124,
      render: (_, h) => (
        <div className="text-[13px] leading-5 tabular-nums">
          <div>{ageOf(h.dob) || '—'}</div>
          <Text type="secondary" className="!text-xs">
            {h.weightKg ? `${h.weightKg} kg` : 'Chưa cân'}
          </Text>
        </div>
      ),
    });
  }
  if (showPeople) {
    columns.push({
      title: 'Chủ & bác sĩ',
      key: 'owner',
      width: 210,
      render: (_, h) => (
        <div className="flex min-w-0 flex-col">
          <Person label="Chủ" name={h.owner?.name || 'CLB sở hữu'} />
          <Person label="BS" name={h.assignedVet?.name} />
        </div>
      ),
    });
  }
  if (showsNextStep && !archived) columns.push({ title: 'Chuồng', key: 'stall', width: isManager ? 124 : 96, render: (_, h) => stallCell(h) });
  columns.push({
    title: 'Sức khỏe & tập',
    key: 'health',
    width: 170,
    render: (_, h) => {
      const c = h.trainingClearance || { level: 'high' };
      const meta = TRAINING_LEVEL_META[c.level] || TRAINING_LEVEL_META.high;
      return (
        <div className="flex flex-wrap items-start gap-1">
          {/* A horse nobody has examined yet starts as "eligible" in the record; say what is true instead. */}
          {examined(h) === false ? (
            <Tooltip title="Bác sĩ chưa khám tiếp nhận ngựa này — bài nặng và chạy thử cần giấy khám.">
              <Tag className="!m-0">Chưa khám</Tag>
            </Tooltip>
          ) : (
            <Tag className="!m-0" color={HEALTH_COLORS[h.healthStatus]}>
              {HEALTH_LABELS[h.healthStatus] || h.healthStatus}
            </Tag>
          )}
          {/* The training limit only when there is one: a horse cleared for all work says so once, not twice. */}
          {(c.restricted || c.level !== 'high') && (
            <Tooltip title={[c.reason, c.prescribedBy && `Bác sĩ ${c.prescribedBy}`].filter(Boolean).join(' — ') || 'Theo phác đồ điều trị'}>
              <Tag className="!m-0 !max-w-full !whitespace-normal" color={meta.color} variant="filled">
                {meta.short}
              </Tag>
            </Tooltip>
          )}
        </div>
      );
    },
  });
  if (showPlan) {
    columns.push({
      title: 'Kế hoạch',
      key: 'plan',
      width: 250,
      render: (_, h) => {
        const p = planByHorse.get(String(h._id));
        if (!p) return <Text type="secondary" className="!text-xs">Chưa có kế hoạch</Text>;
        const g = p.progress || {};
        const where = !g.started ? `Bắt đầu ${dayjs(p.startDate).format('DD/MM')}` : g.ended ? 'Đã hết kế hoạch' : `${PHASE_SHORT[p.phase] || 'Đang tập'} · tuần ${g.week}/${g.totalWeeks}`;
        const race = p.targetRace && g.raceInDays >= 0 ? ` · giải ${g.raceInDays ? `còn ${g.raceInDays} ngày` : 'hôm nay'}` : '';
        const next = g.upcoming?.[0];
        const nextText = next ? `Buổi tới: ${SESSION_KINDS[next.kind]?.short || SESSION_KINDS[next.kind]?.label || 'buổi tập'} · ${sessionTimeLabel(next.scheduledAt)}` : 'Chưa có buổi trong 2 tuần tới';
        return (
          <div className="min-w-0 text-[13px] leading-5">
            <div className="truncate" title={p.targetRace?.raceName ? `${where}${race} (${p.targetRace.raceName})` : where}>
              {where}
              {race && <span className="text-pink-700">{race}</span>}
            </div>
            <Text type="secondary" className="block truncate !text-xs" title={nextText}>
              {nextText}
            </Text>
          </div>
        );
      },
    });
  }
  // Who's responsible matters to the Manager (they assign it); other roles get the owner under the name.
  if (isManager) {
    columns.push({
      title: 'Phụ trách',
      key: 'people',
      width: 200,
      render: (_, h) => (
        <div className="flex min-w-0 flex-col">
          <Person label="Chủ" name={h.owner?.name} gap />
          <Person label="HLV" name={h.assignedTrainer?.name} gap />
          <Person label="BS" name={h.assignedVet?.name} gap />
        </div>
      ),
    });
  }
  if (showsNextStep && !archived) {
    columns.push({ title: 'Bước tiếp theo', key: 'nextStep', render: (_, h) => <HorseNextStep checklist={checklistByHorse.get(String(h._id))} /> });
  }
  if (isManager && archived) {
    columns.push({
      title: 'Ngừng quản lý',
      key: 'archived',
      width: 220,
      render: (_, h) => (
        <span className="text-sm">
          {h.archivedReason || '—'}
          {h.archivedAt && <Text type="secondary"> · {dayjs(h.archivedAt).format('DD/MM/YYYY')}</Text>}
        </span>
      ),
    });
  }
  if (isManager) {
    columns.push({
      title: '',
      key: 'actions',
      width: archived ? 120 : 92,
      align: 'right',
      render: (_, record) =>
        archived ? (
          <Button
            size="small"
            icon={<RollbackOutlined />}
            loading={unarchiveMutation.isPending && unarchiveMutation.variables?._id === record._id}
            onClick={(e) => {
              e.stopPropagation();
              unarchiveMutation.mutate(record);
            }}
          >
            Khôi phục
          </Button>
        ) : (
          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Tooltip title="Sửa hồ sơ">
              <Button size="small" icon={<EditOutlined />} aria-label={`Sửa ${record.name}`} onClick={() => openEdit(record)} />
            </Tooltip>
            <Popconfirm
              title={`Xoá ngựa "${record.name}"?`}
              description="Chỉ xoá được ngựa chưa có buổi tập, hồ sơ khám hay giải đua."
              okText="Xoá"
              cancelText="Huỷ"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteMutation.mutate(record)}
            >
              <Tooltip title="Xoá">
                <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Xoá ${record.name}`} loading={deleteMutation.isPending && deleteMutation.variables?._id === record._id} />
              </Tooltip>
            </Popconfirm>
          </div>
        ),
    });
  }

  // The list as narrowed by the search box and the chosen tile.
  const q = fold(search.trim());
  const matches = (h) =>
    !q || fold([h.name, h.breed, h.color, h.owner?.name, h.assignedTrainer?.name, h.assignedVet?.name, stallByHorse.get(String(h._id))].join(' ')).includes(q);
  const FOCUS = { all: () => true, ready: isReady, watch: needsWatch, gap: isGap, unexamined: (h) => examined(h) === false };
  const source = archived ? archivedHorses : horses;
  // Newest first: a horse just added or changed is the first row.
  const rows = newestFirst(source.filter(matches).filter((h) => archived || (FOCUS[focus] || FOCUS.all)(h)));

  const tiles = [
    { key: 'all', label: 'Tổng đàn ngựa', value: horses.length, tone: 'text-[#0F5A43]' },
    { key: 'ready', label: 'Đủ điều kiện tập', value: readyCount, tone: 'text-emerald-700', hint: unexaminedCount ? `${unexaminedCount} ngựa chưa khám` : null },
    { key: 'watch', label: 'Theo dõi y tế', value: watchCount, tone: watchCount ? 'text-amber-700' : 'text-slate-700', hint: restrictedCount ? `${restrictedCount} ngựa bị hạn chế tập` : null },
    { key: 'gap', label: isManager ? 'Khuyết phụ trách' : 'Chưa có kế hoạch', value: gapCount, tone: gapCount ? 'text-rose-600' : 'text-slate-700' },
  ];

  return (
    <div>
      {showsNextStep ? (
        <PageHeroBanner
          eyebrow="Hồ sơ & danh mục ngựa"
          roleLabel={isManager ? 'Quản lý CLB' : 'HLV trưởng'}
          title={isManager ? 'Danh mục & quản lý đàn ngựa' : 'Danh sách ngựa phụ trách'}
          actionButton={
            isManager ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  icon={<DownloadOutlined />}
                  onClick={() => downloadFile('/export/horses', `danh-sach-ngua-${new Date().toISOString().slice(0, 10)}.csv`).catch((e) => message.error(e.message || 'Xuất file thất bại.'))}
                  className="!h-9 !rounded-lg !bg-white/10 hover:!bg-white/15 !border-white/20 !text-white"
                >
                  Xuất CSV
                </Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openCreate}
                  className="!h-9 !px-4 !rounded-lg !bg-[#D4AF37] hover:!bg-[#E2C058] !border-[#D4AF37] !text-[#061812] font-semibold cursor-pointer"
                >
                  Thêm ngựa mới
                </Button>
              </div>
            ) : null
          }
        />
      ) : (
        <Title level={3} className="!mb-4">
          Danh sách Ngựa
        </Title>
      )}

      {/* The counts double as filters: a tile narrows the list below to its horses. */}
      {showsNextStep && (
        <div className="light-surface-box grid grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E4DFD3] mb-4 rounded-xl bg-[#FAF7F0] border border-[#E5DEC9] shadow-xs overflow-hidden">
          {tiles.map((t) => {
            const on = focus === t.key && !archived;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setView('active');
                  setFocus(on && t.key !== 'all' ? 'all' : t.key);
                }}
                className={`cursor-pointer border-0 px-4 py-2.5 text-left transition-colors ${on ? 'bg-[#0F5A43]/10 shadow-[inset_0_-3px_0_#0F5A43]' : 'bg-transparent hover:bg-black/[0.03]'}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="whitespace-nowrap text-xs font-medium text-slate-600">{t.label}</span>
                  <span className={`whitespace-nowrap text-lg font-bold tabular-nums ${t.tone}`}>
                    {t.value} <span className="text-xs font-normal text-slate-500">ngựa</span>
                  </span>
                </div>
                {t.hint && <div className="mt-0.5 text-[11px] text-slate-500">{t.hint}</div>}
              </button>
            );
          })}
        </div>
      )}

      {isError && (
        <Alert
          className="mb-3"
          type="error"
          showIcon
          title="Chưa tải được danh sách đàn ngựa"
          description={error?.message || 'Không thể lấy dữ liệu đàn ngựa lúc này.'}
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      )}

      {incomplete.length > 0 && focus !== 'gap' && !archived && (
        <Alert
          className="mb-3"
          type="warning"
          showIcon
          title={`${incomplete.length} ngựa chưa đủ người phụ trách: ${incomplete.map((h) => h.name).join(', ')}`}
          action={
            <Button size="small" onClick={() => setFocus('gap')}>
              Xem các ngựa này
            </Button>
          }
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {isManager && (
          <Segmented
            value={view}
            onChange={(v) => {
              setView(v);
              setFocus('all');
            }}
            options={[
              { value: 'active', label: `Đang quản lý (${horses.length})` },
              { value: 'archived', label: 'Đã ngừng quản lý' },
            ]}
          />
        )}
        <Input
          allowClear
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Tìm tên, giống, chủ, HLV, bác sĩ, chuồng…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="!w-full sm:!w-80"
        />
        {focus !== 'all' && !archived && (
          <Tag closable onClose={() => setFocus('all')} className="!m-0 !py-1">
            Đang lọc: {tiles.find((t) => t.key === focus)?.label}
          </Tag>
        )}
        <Text type="secondary" className="!text-xs sm:ml-auto">
          {rows.length}/{source.length} ngựa
        </Text>
      </div>

      <Table
        rowKey="_id"
        size="small"
        columns={columns}
        dataSource={rows}
        loading={archived ? archivedLoading && !archivedData : isLoading && !data}
        tableLayout="fixed"
        scroll={{ x: isManager ? 960 : 700 }}
        pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
        locale={{
          emptyText:
            source.length > 0 ? (
              <Empty description="Không có ngựa nào khớp tìm kiếm / bộ lọc.">
                <Button
                  size="small"
                  onClick={() => {
                    setSearch('');
                    setFocus('all');
                  }}
                >
                  Bỏ lọc
                </Button>
              </Empty>
            ) : isManager ? (
              <Empty description='Chưa có ngựa nào trong danh mục. Nhấn "Thêm ngựa mới" để bắt đầu.'>
                {!archived && (
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
                    Thêm ngựa mới
                  </Button>
                )}
              </Empty>
            ) : (
              <Empty
                description={
                  <span>
                    Bạn chưa được phân công phụ trách con ngựa nào.
                    <br />
                    Liên hệ Quản lý Câu lạc bộ để được phân công.
                  </span>
                }
              />
            ),
        }}
        onRow={(record) => ({ onClick: () => navigate(`/horses/${record._id}`) })}
        rowClassName="cursor-pointer"
      />

      {isManager && (
        <Modal
          title={archiveTarget ? `Ngừng quản lý — ${archiveTarget.name}` : ''}
          open={Boolean(archiveTarget)}
          okText="Ngừng quản lý"
          cancelText="Huỷ"
          okButtonProps={{ danger: true, disabled: !archiveReason.trim() }}
          confirmLoading={archiveMutation.isPending}
          onCancel={() => {
            setArchiveTarget(null);
            setArchiveReason('');
          }}
          onOk={() => archiveMutation.mutate({ id: archiveTarget._id, reason: archiveReason.trim() })}
          destroyOnHidden
        >
          {archiveTarget?.blockedReason && <Alert className="!mb-3" type="info" showIcon title={archiveTarget.blockedReason} />}
          <Typography.Paragraph className="!text-sm">
            Ngựa sẽ rời khỏi mọi danh sách làm việc: gỡ chuồng (ngừng sinh việc chăm sóc), hủy các buổi tập đã xếp và kế
            hoạch đang mở, rút các giải sắp tới. Hồ sơ huấn luyện, khám chữa bệnh và thành tích vẫn được giữ lại; bạn có
            thể khôi phục bất cứ lúc nào.
          </Typography.Paragraph>
          <Select
            className="w-full !mb-2"
            placeholder="Chọn nhanh lý do"
            onChange={setArchiveReason}
            options={['Đã bán', 'Nghỉ hưu', 'Chuyển sang câu lạc bộ khác', 'Ngựa đã chết'].map((v) => ({ value: v, label: v }))}
          />
          <Input.TextArea rows={2} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} placeholder="Lý do ngừng quản lý (bắt buộc)" />
        </Modal>
      )}

      {isManager && (
        <HorseFormModal
          open={formOpen}
          editTarget={editTarget}
          form={form}
          saving={saveMutation.isPending}
          onCancel={() => {
            setFormOpen(false);
            setEditTarget(null);
          }}
          onFinish={(values) =>
            // Cleared optional fields are sent as '' / null so the server removes them.
            saveMutation.mutate({
              ...values,
              dob: values.dob ? values.dob.toISOString() : undefined,
              breed: values.breed ?? '',
              color: values.color ?? '',
              sex: values.sex ?? '',
              microchipNumber: values.microchipNumber ?? '',
              registrationNumber: values.registrationNumber ?? '',
              valuationVnd: values.valuationVnd ?? null,
            })
          }
          ownerOptions={activeOptions(ownersData)}
          trainerOptions={activeOptions(trainersData)}
          vetOptions={activeOptions(vetsData)}
          stalls={mapStalls}
          unplaced={stallsData?.data?.unplaced || []}
          grooms={grooms}
          currentStall={editTarget ? stallByHorse.get(String(editTarget._id)) : undefined}
          onOpenStable={() => navigate(editTarget ? `/admin/stables?horse=${editTarget._id}` : '/admin/stables')}
        />
      )}
    </div>
  );
}
