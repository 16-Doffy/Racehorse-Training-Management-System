import { useMemo, useState } from 'react';
import { Modal, Steps, Form, Select, Input, InputNumber, DatePicker, Button, Alert, Typography, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { message } from '../../lib/antdStatic';
import { trainingPlanApi } from './trainingApi';
import PlanTimeline from './PlanTimeline';
import {
  PHASE_LABELS,
  SESSION_KINDS,
  WEEK_DAYS,
  AFTERNOON_KINDS,
  phaseOptions,
  intensityOptions,
  surfaceOptions,
  layPhases,
  planWarnings,
} from './trainingVocab';

const { Text } = Typography;
const MORNING_TIMES = ['05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00'];
const AFTERNOON_TIMES = ['14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
const SLOTS = [
  { slot: 'morning', label: 'Sáng' },
  { slot: 'afternoon', label: 'Chiều' },
];
const REST = 'rest';
const nextMonday = () => {
  const d = dayjs().startOf('day');
  return d.add(((8 - d.day()) % 7) || 7, 'day');
};
const slotOf = (d) => d.slot || 'morning';
const timeHasPassedToday = (date, hhmm) => {
  if (!date || !hhmm || !dayjs(date).isSame(dayjs(), 'day')) return false;
  const [h, m] = hhmm.split(':').map(Number);
  return !dayjs().isBefore(dayjs().hour(h).minute(m).second(0).millisecond(0));
};

/** Kilometres a phase's normal week adds up to, from its template days (morning and afternoon). */
function weekKm(week = []) {
  const metres = week.reduce((n, d) => {
    const k = SESSION_KINDS[d.kind]?.prescription || {};
    return n + (d.distanceM ?? k.distanceM ?? 0) * (d.reps ?? k.reps ?? 1);
  }, 0);
  return Math.round(metres / 100) / 10;
}

/**
 * Lập kế hoạch huấn luyện in three steps, the way a trainer thinks about it:
 * 1. which horse, for which race, from when;
 * 2. the phases leading there (proposed by the server, counted back from race day by its distance);
 * 3. what a normal week looks like in each phase, morning and afternoon.
 */
export default function PlanWizard({ open, onClose, horses = [], races = [], plans = [], lockedHorseIds = new Set() }) {
  const [step, setStep] = useState(0);
  const [form] = Form.useForm();
  const [basics, setBasics] = useState(null);
  const [phases, setPhases] = useState([]);
  const [race, setRace] = useState(null);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const queryClient = useQueryClient();
  const horse = Form.useWatch('horse', form);
  const watchedStart = Form.useWatch('startDate', form);
  const watchedTime = Form.useWatch('sessionTime', form);
  const watchedAfternoonTime = Form.useWatch('afternoonTime', form);

  const activeByHorse = useMemo(() => new Map(plans.filter((p) => p.status === 'active').map((p) => [String(p.horse?._id), p])), [plans]);
  const horseRaces = races.filter(
    (r) => String(r.horse?._id || r.horse) === String(horse) && ['registered', 'confirmed'].includes(r.status) && dayjs(r.raceDate).isAfter(dayjs())
  );

  const reset = () => {
    setStep(0);
    setBasics(null);
    setPhases([]);
    setRace(null);
    form.resetFields();
  };
  const close = () => {
    reset();
    onClose();
  };

  const createMutation = useMutation({
    mutationFn: (payload) => trainingPlanApi.create(payload),
    onSuccess: () => {
      message.success('Đã lập kế hoạch. Bấm "Sinh lịch tuần" để xếp các buổi tập.');
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      close();
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
      setPhases(res.data.phases.map((p) => ({ ...p, surface: values.surface })));
      setStep(1);
    } catch (err) {
      message.error(err.message || 'Không lấy được gợi ý giai đoạn.');
    } finally {
      setLoadingSuggest(false);
    }
  };

  const updatePhase = (i, patch) => setPhases((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setDay = (i, day, slot, kind) =>
    setPhases((list) =>
      list.map((p, j) => {
        if (j !== i) return p;
        const week = p.week.filter((d) => !(d.day === day && slotOf(d) === slot));
        return { ...p, week: kind === REST ? week : [...week, { day, slot, kind }] };
      })
    );

  const startDay = basics ? basics.startDate.startOf('day').toDate() : null;
  const laid = startDay ? layPhases(startDay, phases) : [];
  const warnings = basics ? planWarnings(phases, { startDate: startDay, raceDate: race?.raceDate, distance: race?.distance || basics.distanceTarget }) : [];
  const hasError = warnings.some((w) => w.level === 'error');

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
        <div className="flex justify-between">
          <Button onClick={step === 0 ? close : () => setStep(step - 1)}>{step === 0 ? 'Hủy' : 'Quay lại'}</Button>
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
      }
    >
      <Steps
        size="small"
        current={step}
        className="!mb-5"
        items={[{ title: 'Ngựa & mục tiêu' }, { title: 'Các giai đoạn' }, { title: 'Lịch tuần mẫu' }]}
      />

      <div hidden={step !== 0}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ startDate: nextMonday(), sessionTime: '07:30', afternoonTime: '16:00', surface: 'turf' }}
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
                placeholder="Chọn ngựa"
                options={horses.map((h) => ({
                  value: h._id,
                  disabled: lockedHorseIds.has(h._id) || activeByHorse.has(String(h._id)),
                  label: lockedHorseIds.has(h._id)
                    ? `🔒 ${h.name} (đang bị khóa huấn luyện)`
                    : activeByHorse.has(String(h._id))
                      ? `${h.name} (đang có kế hoạch)`
                      : h.name,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="targetRace"
              label="Giải hướng tới"
              extra={horse && !horseRaces.length ? 'Ngựa này chưa đăng ký giải nào sắp tới — có thể lập kế hoạch không gắn giải.' : 'Có giải thì lộ trình được tính ngược từ ngày đua.'}
            >
              <Select
                allowClear
                placeholder="Không nhắm giải cụ thể"
                disabled={!horse}
                options={horseRaces.map((r) => ({
                  value: r._id,
                  label: `${r.raceName} — ${dayjs(r.raceDate).format('DD/MM/YYYY')}${r.distance ? ` · ${r.distance}m` : ''}`,
                }))}
              />
            </Form.Item>
          </div>
          <Form.Item name="goal" label="Mục tiêu" rules={[{ required: true, message: 'Nêu mục tiêu của kế hoạch' }]}>
            <Input placeholder="VD: Đạt 1200m dưới 72 giây, sẵn sàng cho Cúp Mùa Thu." />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4 md:grid-cols-5">
            <Form.Item name="startDate" label="Bắt đầu từ" rules={[{ required: true, message: 'Chọn ngày bắt đầu' }]}>
              <DatePicker className="w-full" format="DD/MM/YYYY" disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item name="sessionTime" label="Giờ tập buổi sáng" rules={[{ required: true }]} extra="Bữa sáng dự kiến 06:00; tập nặng nên từ 07:30. Hệ thống kiểm tra bữa ăn thực tế.">
              <Select options={MORNING_TIMES.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item name="afternoonTime" label="Giờ tập buổi chiều" rules={[{ required: true }]} extra="Chỉ tập nhẹ, nếu lịch có buổi chiều.">
              <Select options={AFTERNOON_TIMES.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item
              name="distanceTarget"
              label="Cự ly thi đấu hướng tới (m)"
              rules={[{ required: true, message: 'Nhập cự ly thi đấu' }]}
              extra="Cự ly của giải. Cự ly từng buổi do loại buổi tập quyết định."
            >
              <InputNumber min={100} max={6000} step={100} className="w-full" placeholder="1200" />
            </Form.Item>
            <Form.Item name="surface" label="Mặt sân" rules={[{ required: true }]}>
              <Select options={surfaceOptions} />
            </Form.Item>
          </div>
          {timeHasPassedToday(watchedStart, watchedTime) && (
            <Alert
              type="warning"
              showIcon
              title={`Hôm nay đã quá ${watchedTime}. Khi sinh lịch, hệ thống bỏ qua buổi sáng đã qua và xếp các buổi tiếp theo theo lịch tuần mẫu.`}
            />
          )}
          {timeHasPassedToday(watchedStart, watchedAfternoonTime) && (
            <Alert
              className="!mt-2"
              type="warning"
              showIcon
              title={`Hôm nay đã quá ${watchedAfternoonTime}. Buổi chiều đã qua cũng được bỏ qua khi sinh lịch.`}
            />
          )}
        </Form>
      </div>

      {step === 1 && (
        <div>
          <Text type="secondary" className="!text-sm block mb-3">
            {race
              ? `Lộ trình chia ngược từ ngày đua ${dayjs(race.raceDate).format('DD/MM/YYYY')} theo cự ly ${race.distance || basics.distanceTarget}m (cự ly càng dài, nền tảng càng dài), tuần đua thuộc giai đoạn Giảm tải, rồi 2 tuần hồi phục.`
              : 'Chưa gắn giải nên gợi ý 4 tuần nền tảng, 3 tuần sức mạnh, 3 tuần tốc độ.'}{' '}
            Sửa số tuần hoặc thông số nếu cần.
          </Text>
          <PlanTimeline phases={phases} startDate={startDay} raceDate={race?.raceDate} />
          {warnings.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {warnings.map((w) => (
                <Alert key={w.text} type={w.level === 'error' ? 'error' : 'warning'} showIcon title={w.text} />
              ))}
            </div>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-2 font-medium">Giai đoạn</th>
                  <th className="py-1 pr-2 font-medium">Số tuần</th>
                  <th className="py-1 pr-2 font-medium">Thời gian</th>
                  <th className="py-1 pr-2 font-medium">Khối lượng (km/tuần)</th>
                  <th className="py-1 pr-2 font-medium">Cường độ</th>
                  <th className="py-1 pr-2 font-medium">Mặt sân</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {phases.map((p, i) => (
                  <tr key={i} className="border-t border-black/5">
                    <td className="py-1.5 pr-2">
                      <Select size="small" className="w-44" value={p.key} options={phaseOptions} onChange={(key) => updatePhase(i, { key })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <InputNumber size="small" min={1} max={12} value={p.weeks} onChange={(weeks) => updatePhase(i, { weeks: weeks || 1 })} />
                    </td>
                    <td className="py-1.5 pr-2 whitespace-nowrap tabular-nums text-gray-600">
                      {laid[i] ? `${dayjs(laid[i].start).format('DD/MM')} – ${dayjs(laid[i].end).format('DD/MM')}` : ''}
                    </td>
                    <td className="py-1.5 pr-2">
                      <InputNumber size="small" min={1} max={100} value={p.weeklyVolumeKm} onChange={(v) => updatePhase(i, { weeklyVolumeKm: v })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Select size="small" className="w-24" value={p.intensity} options={intensityOptions} onChange={(v) => updatePhase(i, { intensity: v })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Select size="small" className="w-28" value={p.surface} options={surfaceOptions} onChange={(v) => updatePhase(i, { surface: v })} />
                    </td>
                    <td className="py-1.5">
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label="Bỏ giai đoạn"
                        disabled={phases.length === 1}
                        onClick={() => setPhases((list) => list.filter((_, j) => j !== i))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            size="small"
            className="!mt-2"
            icon={<PlusOutlined />}
            onClick={() =>
              setPhases((list) => [...list, { key: 'recovery', weeks: 2, intensity: 'light', weeklyVolumeKm: 8, surface: basics?.surface, week: [{ day: 1, kind: 'walk' }, { day: 3, kind: 'walk' }, { day: 5, kind: 'canter' }] }])
            }
          >
            Thêm giai đoạn
          </Button>
        </div>
      )}

      {step === 2 && (
        <div>
          <Text type="secondary" className="!text-sm block mb-3">
            Mỗi giai đoạn có một tuần mẫu: buổi sáng lúc {basics?.sessionTime} là buổi tập chính; buổi chiều lúc {basics?.afternoonTime} chỉ
            đi bộ hoặc phi chậm, để trống là nghỉ.
            {race ? ' Hệ thống tự đặt một buổi chạy thử đủ cự ly giải vào buổi sáng 8 ngày trước ngày đua.' : ''}
          </Text>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-2 font-medium">Giai đoạn</th>
                  <th className="py-1 pr-2 font-medium" />
                  {WEEK_DAYS.map((w) => (
                    <th key={w.day} className="py-1 pr-1 font-medium">
                      {w.short}
                    </th>
                  ))}
                  <th className="py-1 font-medium">≈ km/tuần</th>
                </tr>
              </thead>
              <tbody>
                {phases.map((p, i) =>
                  SLOTS.map(({ slot, label }, si) => (
                    <tr key={`${i}-${slot}`} className={si === 0 ? 'border-t border-black/5' : ''}>
                      <td className="py-1 pr-2 whitespace-nowrap font-medium">
                        {si === 0 && (
                          <>
                            {PHASE_LABELS[p.key]} <Text type="secondary">· {p.weeks}t</Text>
                          </>
                        )}
                      </td>
                      <td className="py-1 pr-2 text-xs text-gray-500">{label}</td>
                      {WEEK_DAYS.map((w) => {
                        const d = p.week.find((x) => x.day === w.day && slotOf(x) === slot);
                        const kinds = slot === 'afternoon' ? AFTERNOON_KINDS : Object.keys(SESSION_KINDS);
                        return (
                          <td key={w.day} className="py-1 pr-1">
                            <Select
                              size="small"
                              className="w-[104px]"
                              value={d?.kind || REST}
                              onChange={(kind) => setDay(i, w.day, slot, kind)}
                              options={[
                                { value: REST, label: <Text type="secondary">Nghỉ</Text> },
                                ...kinds.map((value) => ({
                                  value,
                                  label: (
                                    <Tooltip title={SESSION_KINDS[value].hint} placement="left">
                                      <span>
                                        {SESSION_KINDS[value].short}
                                        {d?.kind === value && d.distanceM ? ` ${d.distanceM}m` : ''}
                                      </span>
                                    </Tooltip>
                                  ),
                                })),
                              ]}
                            />
                          </td>
                        );
                      })}
                      <td className="py-1 tabular-nums">{si === 0 ? weekKm(p.week) : ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
