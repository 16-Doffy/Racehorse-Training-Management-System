import { useMemo, useEffect, useState } from 'react';
import { Modal, Steps, Form, Select, Input, InputNumber, DatePicker, Button, Alert, Typography, Tooltip, Collapse } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { message } from '../../lib/antdStatic';
import { trainingPlanApi } from './trainingApi';
import PlanTimeline from './PlanTimeline';
import { PhaseWeekEditor, withParts, fromPreset } from './weekTemplate';
import { useClubPolicy } from './useClubPolicy';
import {
  PHASE_LABELS,
  phaseOptions,
  intensityOptions,
  surfaceOptions,
  layPhases,
  planWarnings,
  RECOVERY_DAYS_BEFORE_RACE,
  TRIAL_DAYS_BEFORE_RACE,
  racePhaseWeeks,
} from './trainingVocab';
import { distanceClass, phaseGuide, midKm, PLAN_RULES } from './planGuide';

const { Text } = Typography;
const MORNING_TIMES = ['05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00'];
const AFTERNOON_TIMES = ['14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
const nextMonday = () => {
  const d = dayjs().startOf('day');
  return d.add(((8 - d.day()) % 7) || 7, 'day');
};
const timeHasPassedToday = (date, hhmm) => {
  if (!date || !hhmm || !dayjs(date).isSame(dayjs(), 'day')) return false;
  const [h, m] = hhmm.split(':').map(Number);
  return !dayjs().isBefore(dayjs().hour(h).minute(m).second(0).millisecond(0));
};
const rangeText = ([a, b]) => (a === b ? `${a}` : `${a}–${b}`);

/**
 * The weeks before the race are fixed by the start date and race day: a phase made longer takes its
 * weeks from the others (the one furthest above its suggested length first), one made shorter gives
 * them to the one furthest below it. `fixed`: the phase the trainer changed. Returns { phases, moved }.
 */
function fitRaceWeeks(list, fixed, budget, guideOf) {
  const next = list.map((p) => ({ ...p }));
  const others = next.map((p, i) => ({ p, i })).filter(({ p, i }) => i !== fixed && p.key !== 'recovery');
  let total = next.filter((p) => p.key !== 'recovery').reduce((n, p) => n + (Number(p.weeks) || 0), 0);
  const moved = new Map();
  const room = ({ p }) => {
    const [low, high] = guideOf(p.key)?.weeks || [1, 12];
    return { above: p.weeks - low, below: high - p.weeks };
  };
  while (total > budget) {
    const pick = others.filter((x) => x.p.weeks > 1).sort((a, b) => room(b).above - room(a).above || b.p.weeks - a.p.weeks)[0];
    if (!pick) break;
    pick.p.weeks -= 1;
    total -= 1;
    moved.set(pick.i, (moved.get(pick.i) || 0) - 1);
  }
  while (total < budget) {
    const pick = others.filter((x) => x.p.key !== 'peak' && x.p.weeks < 12).sort((a, b) => room(b).below - room(a).below)[0];
    if (!pick) break;
    pick.p.weeks += 1;
    total += 1;
    moved.set(pick.i, (moved.get(pick.i) || 0) + 1);
  }
  return { phases: next, moved };
}

/** A small gray hint beside an input, amber when the value is outside the suggested range. */
const Hint = ({ range, value, unit = '' }) => {
  if (!range) return null;
  const out = value != null && (value < range[0] || value > range[1]);
  return (
    <Tooltip title="Mức lý tưởng cho cự ly giải này (khi đủ thời gian chuẩn bị).">
      <span className={`ml-2 cursor-default whitespace-nowrap text-xs ${out ? 'text-amber-700' : 'text-gray-400'}`}>
        gợi ý {rangeText(range)}
        {unit}
      </span>
    </Tooltip>
  );
};

/**
 * Lập kế hoạch huấn luyện in three steps, the way a trainer thinks about it:
 * 1. which horse, for which race, from when;
 * 2. the phases leading there (proposed by the server, counted back from race day by its distance);
 * 3. what a normal week looks like in each phase, morning and afternoon, one phase at a time.
 */
export default function PlanWizard({ open, onClose, horses = [], races = [], plans = [], lockedHorseIds = new Set(), preset = null, onCreated }) {
  const [step, setStep] = useState(0);
  const [form] = Form.useForm();
  const [basics, setBasics] = useState(null);
  const [phases, setPhases] = useState([]);
  const [race, setRace] = useState(null);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  // The weeks before the race (start date → race day): what the phases before it share. Null without a race.
  const [raceBudget, setRaceBudget] = useState(null);
  // The phase whose week is shown in step 3.
  const [phaseTab, setPhaseTab] = useState(0);
  const queryClient = useQueryClient();
  const policy = useClubPolicy();
  const horse = Form.useWatch('horse', form);
  const watchedStart = Form.useWatch('startDate', form);
  const watchedTime = Form.useWatch('sessionTime', form);
  const watchedAfternoonTime = Form.useWatch('afternoonTime', form);

  const activeByHorse = useMemo(() => new Map(plans.filter((p) => p.status === 'active').map((p) => [String(p.horse?._id), p])), [plans]);
  const horseRaces = races.filter(
    (r) => String(r.horse?._id || r.horse) === String(horse) && ['registered', 'confirmed'].includes(r.status) && dayjs(r.raceDate).isAfter(dayjs())
  );

  // Opened from a race entry ("Lập kế hoạch"): the horse, the race, its distance and surface are filled in.
  useEffect(() => {
    if (!open || !preset?.race) return;
    const r = races.find((x) => String(x._id) === String(preset.race));
    if (!r) return;
    form.setFieldsValue({
      horse: String(r.horse?._id || r.horse),
      targetRace: r._id,
      ...(r.distance ? { distanceTarget: r.distance } : {}),
      ...(r.surface ? { surface: r.surface } : {}),
    });
  }, [open, preset, races, form]);

  const reset = () => {
    setStep(0);
    setBasics(null);
    setPhases([]);
    setRace(null);
    setPhaseTab(0);
    setRaceBudget(null);
    form.resetFields();
  };
  const close = () => {
    reset();
    onClose();
  };

  const createMutation = useMutation({
    mutationFn: (payload) => trainingPlanApi.create(payload),
    onSuccess: (res) => {
      // The server books this week and next straight away (and keeps two weeks booked from then on).
      message.success('Đã lập kế hoạch — lịch tập tuần này và tuần sau đã được xếp sẵn.');
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      close();
      onCreated?.(res?.data);
    },
    onError: (err) => message.error(err.message || 'Lập kế hoạch thất bại.'),
  });

  const goToPhases = async () => {
    const values = await form.validateFields();
    setLoadingSuggest(true);
    try {
      const res = await trainingPlanApi.suggest({
        horse: values.horse,
        targetRace: values.targetRace || undefined,
        distance: values.distanceTarget,
        // Day only, as YYYY-MM-DD: the server reads it in the club's time zone.
        startDate: values.startDate.format('YYYY-MM-DD'),
      });
      setBasics(values);
      setRace(res.data.race);
      // Each phase starts from its detailed week (planGuide.js): every day's sessions in parts, on the clock.
      const distance = res.data.race?.distance || values.distanceTarget;
      // For a race, the weeks are counted here too (the same rule as the server): the taper ends with the
      // trial, a few days of recovery follow, and the plan is done PRE_RACE_DAYS before race day,
      // whatever version of the server answered.
      const suggested = res.data.race
        ? racePhaseWeeks(values.startDate.toDate(), res.data.race.raceDate, distance).map((p) => {
            const fromServer = res.data.phases.find((x) => x.key === p.key);
            const g = phaseGuide(distance, p.key);
            return { intensity: g?.intensity, weeklyVolumeKm: g ? midKm(g.km) : undefined, week: [], ...fromServer, ...p };
          })
        : res.data.phases;
      const proposed = suggested.map((p) => {
        const g = phaseGuide(distance, p.key);
        return { ...p, surface: values.surface, week: g?.recommendedWeek ? g.recommendedWeek.map(fromPreset) : (p.week || []).map(withParts) };
      });
      setPhases(proposed);
      setRaceBudget(res.data.race ? proposed.filter((p) => p.key !== 'recovery').reduce((n, p) => n + (Number(p.weeks) || 0), 0) : null);
      setPhaseTab(0);
      setStep(1);
    } catch (err) {
      message.error(err.message || 'Không lấy được gợi ý giai đoạn.');
    } finally {
      setLoadingSuggest(false);
    }
  };

  const updatePhase = (i, patch) => setPhases((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const startDay = basics ? basics.startDate.startOf('day').toDate() : null;
  const laid = startDay ? layPhases(startDay, phases) : [];
  const warnings = basics ? planWarnings(phases, { startDate: startDay, raceDate: race?.raceDate, distance: race?.distance || basics.distanceTarget }) : [];
  // Reference numbers for this race distance, beside each phase (planGuide.js).
  const guideDistance = race?.distance || basics?.distanceTarget;
  const guideClass = distanceClass(guideDistance);
  const totalWeeks = phases.reduce((n, p) => n + (Number(p.weeks) || 0), 0);
  const fillFromGuide = () =>
    setPhases((list) =>
      list.map((p) => {
        const g = phaseGuide(guideDistance, p.key);
        return g ? { ...p, weeklyVolumeKm: midKm(g.km), intensity: g.intensity } : p;
      })
    );
  /** A phase's weeks changed: before the race, the other phases give or take the difference. */
  const setWeeks = (i, weeks) => {
    const changed = phases.map((p, j) => (j === i ? { ...p, weeks } : p));
    if (!raceBudget || phases[i].key === 'recovery') return setPhases(changed);
    const { phases: fitted, moved } = fitRaceWeeks(changed, i, raceBudget, (key) => phaseGuide(guideDistance, key));
    setPhases(fitted);
    if (moved.size) {
      const what = [...moved].map(([j, n]) => `${n < 0 ? 'bớt' : 'thêm'} ${Math.abs(n)} tuần ${PHASE_LABELS[fitted[j].key]}`).join(', ');
      message.info(`Để vẫn kịp ngày đua, đã ${what}.`);
    }
    return undefined;
  };
  const preRaceWeeks = phases.filter((p) => p.key !== 'recovery').reduce((n, p) => n + (Number(p.weeks) || 0), 0);
  // With a race: the end of the build-up (the trial), the recovery after it, the plan's last day and the
  // days left free before race day (rest, the vet, the trip).
  const planEnd = laid.length ? laid[laid.length - 1].end : null;
  const lastWork = [...laid].reverse().find((p) => p.key !== 'recovery');
  const recoveryFrom = laid.find((p) => p.key === 'recovery')?.start;
  const freeDays = race && planEnd ? dayjs(race.raceDate).startOf('day').diff(dayjs(planEnd).startOf('day'), 'day') - 1 : null;
  const raceIntro = () => {
    const ddmm = (d) => dayjs(d).format('DD/MM');
    const parts = [];
    if (lastWork) parts.push(`tập tới hết ${PHASE_LABELS[lastWork.key]} ngày ${ddmm(lastWork.end)} (chạy thử đủ cự ly ngày ${ddmm(dayjs(race.raceDate).subtract(TRIAL_DAYS_BEFORE_RACE, 'day'))})`);
    if (recoveryFrom) parts.push(`Hồi phục tập nhẹ ${ddmm(recoveryFrom)} – ${ddmm(planEnd)}`);
    if (freeDays > 0) parts.push(`chừa ${freeDays} ngày (${ddmm(dayjs(planEnd).add(1, 'day'))} – ${ddmm(dayjs(race.raceDate).subtract(1, 'day'))}) để ngựa nghỉ, khám trước giải và di chuyển tới trường đua`);
    return `Chia ngược từ ngày đua ${dayjs(race.raceDate).format('DD/MM/YYYY')} (${race.distance || basics.distanceTarget} m): ${parts.join(', ')}.`;
  };
  /** Another phase: with a race, a week more work before the taper (the weeks before the race kept); else recovery at the end. */
  const addPhase = () => {
    const surface = basics?.surface;
    if (!race) {
      setPhases((list) => [...list, { key: 'recovery', weeks: 2, intensity: 'light', weeklyVolumeKm: 8, surface, week: [{ day: 1, kind: 'walk' }, { day: 3, kind: 'walk' }, { day: 5, kind: 'canter' }].map(withParts) }]);
      return;
    }
    const taper = phases.map((p) => p.key).lastIndexOf('peak');
    const firstRecovery = phases.findIndex((p) => p.key === 'recovery');
    const at = taper >= 0 ? taper : firstRecovery >= 0 ? firstRecovery : phases.length;
    const g = phaseGuide(guideDistance, 'speed');
    const added = { key: 'speed', weeks: 1, intensity: g?.intensity || 'high', weeklyVolumeKm: g ? midKm(g.km) : 15, surface, week: g?.recommendedWeek ? g.recommendedWeek.map(fromPreset) : [] };
    const list = [...phases.slice(0, at), added, ...phases.slice(at)];
    setPhases(raceBudget ? fitRaceWeeks(list, at, raceBudget, (key) => phaseGuide(guideDistance, key)).phases : list);
  };
  const hasError = warnings.some((w) => w.level === 'error');
  const shownTab = Math.min(phaseTab, Math.max(0, phases.length - 1));

  const submit = () =>
    createMutation.mutate({
      horse: basics.horse,
      goal: basics.goal,
      targetRace: basics.targetRace || null,
      startDate: basics.startDate.format('YYYY-MM-DD'),
      sessionTime: basics.sessionTime,
      afternoonTime: basics.afternoonTime,
      distanceTarget: basics.distanceTarget,
      surface: basics.surface,
      status: 'active',
      phases: phases.map((p) => ({
        key: p.key,
        weeks: p.weeks,
        extraDays: p.extraDays || 0,
        weeklyVolumeKm: p.weeklyVolumeKm,
        intensity: p.intensity,
        surface: p.surface,
        week: p.week,
      })),
    });

  return (
    <Modal
      title="Lập kế hoạch huấn luyện"
      open={open}
      width={1120}
      onCancel={close}
      destroyOnHidden
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button onClick={step === 0 ? close : () => setStep(step - 1)}>{step === 0 ? 'Hủy' : 'Quay lại'}</Button>
          <div className="flex items-center gap-3">
            {basics && step > 0 && (
              <span className="hidden text-xs text-gray-500 sm:inline">
                {phases.length} giai đoạn · {totalWeeks} tuần
                {race ? ` · đua ${dayjs(race.raceDate).format('DD/MM/YYYY')}` : ''}
              </span>
            )}
            {step === 0 && (
              <Button type="primary" loading={loadingSuggest} onClick={goToPhases}>
                Tiếp: chia giai đoạn
              </Button>
            )}
            {step === 1 && (
              <Tooltip title={hasError ? 'Sửa các lỗi màu đỏ trước khi tiếp tục' : null}>
                <Button type="primary" disabled={!phases.length || hasError} onClick={() => setStep(2)}>
                  Tiếp: lịch tuần mẫu
                </Button>
              </Tooltip>
            )}
            {step === 2 && (
              <Button type="primary" disabled={hasError} loading={createMutation.isPending} onClick={submit}>
                Áp dụng kế hoạch
              </Button>
            )}
          </div>
        </div>
      }
    >
      <Steps size="small" current={step} className="!mb-6" items={[{ title: 'Ngựa & mục tiêu' }, { title: 'Các giai đoạn' }, { title: 'Lịch tuần mẫu' }]} />

      {/* Step 1: kept mounted, the form holds its values while the trainer goes back and forth. */}
      <div hidden={step !== 0}>
        <Form
          form={form}
          layout="vertical"
          requiredMark="optional"
          initialValues={{ startDate: nextMonday(), sessionTime: policy.morningTime, afternoonTime: policy.afternoonTime, surface: 'turf' }}
          onValuesChange={(changed) => {
            if (changed.horse) form.setFieldValue('targetRace', undefined);
            if (changed.targetRace) {
              const r = races.find((x) => x._id === changed.targetRace);
              if (r?.distance) form.setFieldValue('distanceTarget', r.distance);
              if (r?.surface) form.setFieldValue('surface', r.surface);
            }
          }}
        >
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <Form.Item name="horse" label="Ngựa" rules={[{ required: true, message: 'Chọn ngựa' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Chọn ngựa"
                options={horses.map((h) => ({
                  value: h._id,
                  disabled: lockedHorseIds.has(h._id) || activeByHorse.has(String(h._id)),
                  label: lockedHorseIds.has(h._id) ? `${h.name} — đang bị khóa huấn luyện` : activeByHorse.has(String(h._id)) ? `${h.name} — đang có kế hoạch` : h.name,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="targetRace"
              label="Giải hướng tới"
              tooltip="Có giải thì các giai đoạn được chia ngược từ ngày đua, và hệ thống tự xếp buổi chạy thử."
              extra={horse && !horseRaces.length ? 'Ngựa này chưa đăng ký giải nào sắp tới — vẫn lập kế hoạch được.' : null}
            >
              <Select
                allowClear
                placeholder="Không nhắm giải cụ thể"
                disabled={!horse}
                options={horseRaces.map((r) => ({
                  value: r._id,
                  label: `${r.raceName} — ${dayjs(r.raceDate).format('DD/MM/YYYY')}${r.distance ? ` · ${r.distance} m` : ''}`,
                }))}
              />
            </Form.Item>
          </div>
          <Form.Item name="goal" label="Mục tiêu" rules={[{ required: true, message: 'Nêu mục tiêu của kế hoạch' }]}>
            <Input placeholder="VD: Đạt 1200 m dưới 72 giây, sẵn sàng cho Cúp Mùa Thu." />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4 md:grid-cols-5">
            <Form.Item name="startDate" label="Bắt đầu từ" rules={[{ required: true, message: 'Chọn ngày bắt đầu' }]}>
              <DatePicker className="w-full" format="DD/MM/YYYY" disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item name="sessionTime" label="Giờ tập sáng" rules={[{ required: true }]} tooltip="Buổi tập chính. Bữa sáng dự kiến 06:00, tập nặng nên từ 07:30; hệ thống kiểm tra bữa ăn thực tế trước giờ tập.">
              <Select options={MORNING_TIMES.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item name="afternoonTime" label="Giờ tập chiều" rules={[{ required: true }]} tooltip="Chỉ dùng khi tuần mẫu có buổi chiều — buổi chiều chỉ tập nhẹ.">
              <Select options={AFTERNOON_TIMES.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item name="distanceTarget" label="Cự ly thi đấu" rules={[{ required: true, message: 'Nhập cự ly' }]} tooltip="Cự ly của giải hướng tới. Cự ly từng buổi do bài tập quyết định.">
              <InputNumber min={100} max={6000} step={100} className="!w-full" suffix="m" placeholder="1200" />
            </Form.Item>
            <Form.Item name="surface" label="Mặt sân" rules={[{ required: true }]}>
              <Select options={surfaceOptions} />
            </Form.Item>
          </div>
          {(timeHasPassedToday(watchedStart, watchedTime) || timeHasPassedToday(watchedStart, watchedAfternoonTime)) && (
            <Alert
              type="info"
              showIcon
              title={`Hôm nay đã quá giờ tập ${timeHasPassedToday(watchedStart, watchedTime) ? watchedTime : watchedAfternoonTime}: buổi đã qua được bỏ qua, lịch bắt đầu từ buổi kế tiếp.`}
            />
          )}
        </Form>
      </div>

      {/* Step 2: the phases, with the reference for this race distance beside each value. */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <Text type="secondary" className="!text-sm">
            {race
              ? raceIntro()
              : 'Chưa gắn giải: gợi ý 4 tuần nền tảng, 3 tuần sức mạnh, 3 tuần tốc độ.'}{' '}
            Chỉnh số tuần và thông số nếu cần.
          </Text>
          <PlanTimeline phases={phases} startDate={startDay} raceDate={race?.raceDate} />
          {warnings.length > 0 && (
            <div className="flex flex-col gap-2">
              {warnings.map((w) => (
                <Alert key={w.text} type={w.level === 'error' ? 'error' : 'warning'} showIcon title={w.text} />
              ))}
            </div>
          )}

          <div className="rounded-lg border border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-sm font-medium text-gray-800">
                Các giai đoạn <span className="font-normal text-gray-500">· {totalWeeks} tuần</span>
                {raceBudget ? (
                  <Tooltip title="Số tuần trước giải cố định theo ngày bắt đầu và ngày đua. Đổi số tuần một giai đoạn, các giai đoạn khác tự bớt hoặc thêm cho vừa.">
                    <span className={`ml-2 font-normal ${preRaceWeeks === raceBudget ? 'text-gray-500' : 'text-amber-700'}`}>· trước ngày đua {preRaceWeeks}/{raceBudget} tuần</span>
                  </Tooltip>
                ) : null}
              </span>
              <div className="flex gap-2">
                <Tooltip title={`Điền km/tuần và cường độ theo số liệu tham khảo cho giải ${guideDistance} m`}>
                  <Button size="small" onClick={fillFromGuide}>
                    Điền theo gợi ý
                  </Button>
                </Tooltip>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={addPhase}
                >
                  Thêm giai đoạn
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="px-3 py-2 font-medium">Giai đoạn</th>
                    <th className="px-3 py-2 font-medium">Số tuần</th>
                    <th className="px-3 py-2 font-medium">Thời gian</th>
                    <th className="px-3 py-2 font-medium">Khối lượng / tuần</th>
                    <th className="px-3 py-2 font-medium">Cường độ</th>
                    <th className="px-3 py-2 font-medium">Mặt sân</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {phases.map((p, i) => {
                    const g = phaseGuide(guideDistance, p.key);
                    return (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <Select size="small" className="!w-44" value={p.key} options={phaseOptions} onChange={(key) => updatePhase(i, { key })} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {race && p.key === 'recovery' ? (
                            // Before a race, recovery is a few days: counted in days.
                            <Tooltip title={`Tập nhẹ sau buổi chạy thử, trước ngày đua — thường ${RECOVERY_DAYS_BEFORE_RACE}–7 ngày.`}>
                              <InputNumber
                                size="small"
                                className="!w-24"
                                min={1}
                                max={14}
                                suffix="ngày"
                                value={Math.max(1, (Number(p.weeks) || 0) * 7 + (Number(p.extraDays) || 0))}
                                onChange={(days) => updatePhase(i, { weeks: 1, extraDays: (days || 1) - 7 })}
                              />
                            </Tooltip>
                          ) : (
                            <>
                              <InputNumber size="small" className="!w-16" min={1} max={raceBudget && p.key !== 'recovery' ? Math.max(1, raceBudget - (phases.filter((x) => x.key !== 'recovery').length - 1)) : 12} value={p.weeks} onChange={(weeks) => setWeeks(i, weeks || 1)} />
                              {p.extraDays ? (
                                <Tooltip title={race ? `Ngày lẻ dồn vào đây để giai đoạn kết thúc đúng buổi chạy thử (${TRIAL_DAYS_BEFORE_RACE} ngày trước giải).` : 'Ngày thêm hoặc bớt so với số tuần.'}>
                                  <span className="ml-1.5 cursor-default text-xs tabular-nums text-gray-500">
                                    {p.extraDays > 0 ? '+' : '−'}
                                    {Math.abs(p.extraDays)} ngày
                                  </span>
                                </Tooltip>
                              ) : null}
                              <Hint range={g?.weeks} value={p.weeks} />
                            </>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-600">{laid[i] ? `${dayjs(laid[i].start).format('DD/MM')} – ${dayjs(laid[i].end).format('DD/MM')}` : ''}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <InputNumber size="small" className="!w-24" min={1} max={100} suffix="km" value={p.weeklyVolumeKm} onChange={(v) => updatePhase(i, { weeklyVolumeKm: v })} />
                          <Hint range={g?.km} value={p.weeklyVolumeKm} />
                        </td>
                        <td className="px-3 py-2">
                          <Select size="small" className="!w-24" value={p.intensity} options={intensityOptions} onChange={(v) => updatePhase(i, { intensity: v })} />
                        </td>
                        <td className="px-3 py-2">
                          <Select size="small" className="!w-28" value={p.surface} options={surfaceOptions} onChange={(v) => updatePhase(i, { surface: v })} />
                        </td>
                        <td className="px-1 py-2 text-right">
                          <Tooltip title="Bỏ giai đoạn">
                            <Button size="small" type="text" icon={<DeleteOutlined />} aria-label="Bỏ giai đoạn" disabled={phases.length === 1} onClick={() => setPhases((list) => list.filter((_, j) => j !== i))} />
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <Collapse
            size="small"
            items={[
              {
                key: 'guide',
                label: (
                  <span className="text-sm">
                    Số liệu tham khảo cho giải {guideDistance} m <span className="text-gray-500">· nhóm {guideClass.label}</span>
                  </span>
                ),
                children: (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-xs">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="py-1 pr-3 font-medium">Giai đoạn</th>
                          <th className="py-1 pr-3 font-medium">Số tuần</th>
                          <th className="py-1 pr-3 font-medium">km/tuần</th>
                          <th className="py-1 pr-3 font-medium">Buổi/tuần</th>
                          <th className="py-1 pr-3 font-medium">Tốc độ · nhịp tim · thời lượng</th>
                          <th className="py-1 font-medium">Trọng tâm · khẩu phần</th>
                        </tr>
                      </thead>
                      <tbody>
                        {['base_building', 'strength', 'speed', 'peak', 'recovery'].map((key) => {
                          const g = phaseGuide(guideDistance, key);
                          return (
                            <tr key={key} className="border-t border-gray-100 align-top">
                              <td className="whitespace-nowrap py-1.5 pr-3 font-medium text-gray-800">{PHASE_LABELS[key]}</td>
                              <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">{rangeText(g.weeks)} tuần</td>
                              <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">{rangeText(g.km)} km</td>
                              <td className="whitespace-nowrap py-1.5 pr-3">{g.sessionsPerWeek}</td>
                              <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">
                                {g.speedKmh} · ≤{g.hrMax} bpm · {g.durationMin}
                              </td>
                              <td className="py-1.5 text-gray-600">
                                {g.focus} <span className="text-gray-400">{g.rationHint}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="mt-2 text-xs text-gray-500">
                      {PLAN_RULES.join(' · ')} Đây là điểm xuất phát; HLV chỉnh theo thể trạng từng con.
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* Step 3: one phase's normal week at a time — seven days, a morning and, when wanted, an afternoon. */}
      {step === 2 && phases.length > 0 && (
        <div className="flex flex-col gap-3">
          <Text type="secondary" className="!text-sm">
            Chọn bài cho từng buổi; giờ kết thúc tự tính theo các phần. Rê chuột để xem từng phần, bấm ✎ để sửa.{race ? ' Chạy thử được tự xếp 8 ngày trước ngày đua.' : ''}
          </Text>
          <PhaseWeekEditor
            phases={phases}
            onChange={setPhases}
            phaseIndex={shownTab}
            onPhaseIndex={setPhaseTab}
            sessionTime={basics?.sessionTime}
            afternoonTime={basics?.afternoonTime}
            guideDistance={guideDistance}
            ranges={laid}
          />
        </div>
      )}
    </Modal>
  );
}
