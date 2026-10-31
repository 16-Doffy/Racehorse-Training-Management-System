import { useState } from 'react';
import { Alert, Button, Checkbox, DatePicker, Input, InputNumber, Modal, Segmented, Select, TimePicker, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { message } from '../../lib/antdStatic';
import { careRoutineApi } from './stableApi';
import { ROUTINE_TEMPLATES, ROUTINE_TYPE_LABELS, ROUTINE_TYPE_OPTIONS, WEEK, countTimes, minutesText, weekDaysText } from './careRoutineVocab';

const { Text } = Typography;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const idOf = (ref) => String(ref?._id || ref || '');
const addHours = (clock, h) => dayjs(clock, 'HH:mm').add(h, 'hour').format('HH:mm');

function Field({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-800">{label}</span>
      {children}
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </div>
  );
}

/**
 * Handing a groom a care job for a stretch of days, not one day at a time: which job, for which horse,
 * how many times a day and at what times, how long each time, on which weekdays, from when to when, and
 * how to do it step by step. Each day it is due it becomes the groom's tasks (careRoutine.service.js).
 * `routine`: the one being changed; `horseId`: the horse it is for when opened from that horse.
 */
export default function CareRoutineModal({ open, routine, horseId, horses = [], grooms = [], stallOfHorse, planOf, onClose }) {
  const queryClient = useQueryClient();
  const fresh = (type = 'icing') => ({
    horse: horseId || undefined,
    assignedTo: null,
    taskType: type,
    title: '',
    instructions: ROUTINE_TEMPLATES[type].instructions,
    times: ROUTINE_TEMPLATES[type].times,
    durationMinutes: ROUTINE_TEMPLATES[type].durationMinutes,
    weekDays: ALL_DAYS,
    startDate: dayjs().startOf('day'),
    endDate: dayjs().add(13, 'day').startOf('day'),
  });
  const fromRoutine = (r) => ({
    horse: idOf(r.horse),
    assignedTo: r.assignedTo ? idOf(r.assignedTo) : null,
    taskType: r.taskType,
    title: r.title || '',
    instructions: r.instructions,
    times: r.times,
    durationMinutes: r.durationMinutes,
    weekDays: r.weekDays,
    startDate: dayjs(r.startDate),
    endDate: r.endDate ? dayjs(r.endDate) : null,
  });
  const [v, setV] = useState(() => (routine ? fromRoutine(routine) : fresh()));
  const [error, setError] = useState(null);
  const set = (patch) => {
    setV((old) => ({ ...old, ...patch }));
    setError(null);
  };

  const horse = horses.find((h) => String(h._id) === String(v.horse));
  const stall = v.horse ? stallOfHorse.get(String(v.horse)) : null;
  const plan = horse ? planOf(horse) : null;
  const planEnd = plan ? plan.endDate || plan.phases?.at(-1)?.endDate : null;
  const groomName = v.assignedTo ? grooms.find((g) => String(g._id) === v.assignedTo)?.name : stall?.caretaker?.name;
  const total = countTimes(v);
  const what = v.taskType === 'other' ? v.title || 'việc khác' : ROUTINE_TYPE_LABELS[v.taskType].toLowerCase();
  const template = ROUTINE_TEMPLATES[v.taskType];

  const pickType = (type) => {
    // A new job takes the usual way of doing it; one being changed keeps what was written.
    const untouched = !v.instructions.trim() || Object.values(ROUTINE_TEMPLATES).some((t) => t.instructions === v.instructions);
    set({
      taskType: type,
      ...(routine ? {} : { times: ROUTINE_TEMPLATES[type].times, durationMinutes: ROUTINE_TEMPLATES[type].durationMinutes }),
      ...(untouched ? { instructions: ROUTINE_TEMPLATES[type].instructions } : {}),
    });
  };
  const setCount = (n) => {
    if (!n) return;
    const times = [...v.times];
    while (times.length < n) times.push(addHours(times.at(-1) || '07:00', 3));
    set({ times: times.slice(0, n) });
  };

  const problem = () => {
    if (!v.horse) return 'Chọn ngựa.';
    if (!v.assignedTo && !stall?.caretaker) return 'Chuồng của ngựa chưa có người chăm sóc: chọn người làm.';
    if (v.taskType === 'other' && !v.title.trim()) return 'Đặt tên cho việc khác.';
    if (!v.times.length || v.times.some((t) => !t)) return 'Chọn đủ giờ cho mỗi lần làm.';
    if (new Set(v.times).size !== v.times.length) return 'Hai lần làm trong ngày trùng giờ.';
    if (!(v.durationMinutes >= 1)) return 'Nhập thời gian mỗi lần làm.';
    if (!v.weekDays.length) return 'Chọn ít nhất một ngày trong tuần.';
    if (!v.startDate) return 'Chọn ngày bắt đầu.';
    if (v.endDate && v.endDate.isBefore(v.startDate, 'day')) return 'Ngày kết thúc phải sau ngày bắt đầu.';
    if (!v.instructions.trim()) return 'Ghi cách làm để nhân viên làm đúng.';
    return null;
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        horse: v.horse,
        assignedTo: v.assignedTo,
        taskType: v.taskType,
        title: v.taskType === 'other' ? v.title.trim() : undefined,
        instructions: v.instructions.trim(),
        times: [...v.times].sort(),
        durationMinutes: v.durationMinutes,
        weekDays: v.weekDays,
        startDate: v.startDate.format('YYYY-MM-DD'),
        endDate: v.endDate ? v.endDate.format('YYYY-MM-DD') : null,
      };
      return routine ? careRoutineApi.update(routine._id, payload) : careRoutineApi.create(payload);
    },
    onSuccess: (res) => {
      const made = res.data?.today?.created || 0;
      message.success(`${routine ? 'Đã sửa' : 'Đã giao'} việc ${what} cho ${groomName || 'nhân viên'}${made ? `; hôm nay có ${made} lần trên danh sách của họ` : ''}.`);
      queryClient.invalidateQueries({ queryKey: ['care-routines'] });
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
      onClose();
    },
    onError: (err) => setError(err.message || 'Chưa giao được việc.'),
  });
  const submit = () => {
    const p = problem();
    if (p) return setError(p);
    return save.mutate();
  };

  return (
    <Modal
      open={open}
      width={780}
      centered
      title={routine ? 'Sửa việc giao dài hạn' : 'Giao việc chăm sóc'}
      onCancel={onClose}
      onOk={submit}
      okText={routine ? 'Lưu thay đổi' : 'Giao việc'}
      cancelText="Huỷ"
      confirmLoading={save.isPending}
      destroyOnHidden
      styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingRight: 4 } }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Ngựa">
            <Select
              showSearch
              optionFilterProp="label"
              disabled={Boolean(routine)}
              placeholder="Chọn ngựa"
              value={v.horse}
              onChange={(horse) => set({ horse, assignedTo: null })}
              options={horses.filter((h) => !h.isArchived).map((h) => ({ value: String(h._id), label: h.name }))}
            />
          </Field>
          <Field label="Người làm" hint={stall ? `Chuồng ${stall.code}${stall.caretaker?.name ? ` · người chăm sóc: ${stall.caretaker.name}` : ' · chưa có người chăm sóc'}` : undefined}>
            <Select
              value={v.assignedTo || 'stall'}
              onChange={(id) => set({ assignedTo: id === 'stall' ? null : id })}
              options={[
                { value: 'stall', label: stall?.caretaker?.name ? `Người chăm sóc chuồng (${stall.caretaker.name})` : 'Người chăm sóc chuồng' },
                ...grooms.map((g) => ({ value: String(g._id), label: g.name })),
              ]}
            />
          </Field>
        </div>

        <Field label="Công việc" hint={template.hint}>
          <Segmented block value={v.taskType} onChange={pickType} options={ROUTINE_TYPE_OPTIONS} />
        </Field>
        {v.taskType === 'other' && (
          <Field label="Tên việc">
            <Input maxLength={80} placeholder="VD: Dắt đi bộ thư giãn, chải lông, xoa bóp cơ lưng" value={v.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
        )}

        <section className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <span className="text-sm font-semibold text-gray-900">Lịch làm</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Từ ngày">
              <DatePicker
                className="w-full"
                format="DD/MM/YYYY"
                allowClear={false}
                value={v.startDate}
                disabled={Boolean(routine) && v.startDate?.isBefore(dayjs(), 'day')}
                disabledDate={(d) => d && d.isBefore(dayjs(), 'day')}
                onChange={(d) => set({ startDate: d, ...(v.endDate && d && v.endDate.isBefore(d, 'day') ? { endDate: d } : {}) })}
              />
            </Field>
            <Field label="Đến ngày">
              <DatePicker
                className="w-full"
                format="DD/MM/YYYY"
                placeholder="Không hẹn ngày kết thúc"
                value={v.endDate}
                disabledDate={(d) => d && d.isBefore(v.startDate || dayjs(), 'day')}
                onChange={(d) => set({ endDate: d })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Text type="secondary" className="!text-xs">
              Nhanh:
            </Text>
            {[
              ['1 tuần', 6],
              ['2 tuần', 13],
              ['1 tháng', 29],
            ].map(([label, n]) => (
              <Button key={label} size="small" onClick={() => set({ endDate: (v.startDate || dayjs()).add(n, 'day') })}>
                {label}
              </Button>
            ))}
            {planEnd && dayjs(planEnd).isAfter(v.startDate || dayjs(), 'day') && (
              <Button size="small" onClick={() => set({ endDate: dayjs(planEnd).startOf('day') })}>
                Đến hết kế hoạch tập ({dayjs(planEnd).format('DD/MM')})
              </Button>
            )}
            <Button size="small" type="text" onClick={() => set({ endDate: null })}>
              Không hẹn ngày kết thúc
            </Button>
          </div>
          <Field label="Ngày trong tuần">
            <div className="flex flex-wrap items-center gap-3">
              <Checkbox.Group value={v.weekDays} onChange={(weekDays) => set({ weekDays })} options={WEEK} />
              {v.weekDays.length !== 7 && (
                <Button size="small" type="link" className="!px-0" onClick={() => set({ weekDays: ALL_DAYS })}>
                  Mỗi ngày
                </Button>
              )}
            </div>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
            <Field label="Mỗi ngày làm">
              <InputNumber min={1} max={8} value={v.times.length} onChange={setCount} suffix="lần" className="!w-28" />
            </Field>
            <Field label="Vào lúc">
              <div className="flex flex-wrap gap-2">
                {v.times.map((t, i) => (
                  <TimePicker
                    key={i}
                    format="HH:mm"
                    minuteStep={5}
                    allowClear={false}
                    needConfirm={false}
                    aria-label={`Giờ lần ${i + 1}`}
                    value={t ? dayjs(t, 'HH:mm') : null}
                    onChange={(_, value) => set({ times: v.times.map((x, j) => (j === i ? value : x)) })}
                    className="!w-24"
                  />
                ))}
              </div>
            </Field>
          </div>
          <Field label="Mỗi lần kéo dài">
            <div className="flex flex-wrap items-center gap-2">
              <InputNumber min={1} max={480} step={5} value={v.durationMinutes} onChange={(n) => set({ durationMinutes: n })} suffix="phút" className="!w-32" />
              {v.durationMinutes > 0 && v.times.length > 1 && (
                <Text type="secondary" className="!text-xs">
                  Mỗi ngày tổng {minutesText(v.durationMinutes * v.times.length)}
                </Text>
              )}
            </div>
          </Field>
        </section>

        <Field label="Cách làm (nhân viên đọc trên từng lần làm)">
          <Input.TextArea
            autoSize={{ minRows: 5, maxRows: 12 }}
            maxLength={2000}
            showCount
            placeholder="Ghi từng bước: làm gì, dùng gì, chú ý gì, khi nào phải báo lại."
            value={v.instructions}
            onChange={(e) => set({ instructions: e.target.value })}
          />
          {template.instructions && v.instructions !== template.instructions && (
            <Button size="small" type="link" className="!self-start !px-0" onClick={() => set({ instructions: template.instructions })}>
              Dùng cách làm mẫu của {ROUTINE_TYPE_LABELS[v.taskType].toLowerCase()}
            </Button>
          )}
        </Field>

        {horse && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-gray-800">
            <b>{groomName || 'Người chăm sóc chuồng'}</b> sẽ {what} cho <b>{horse.name}</b> {v.times.length} lần mỗi ngày ({[...v.times].sort().join(', ')}), mỗi lần {minutesText(v.durationMinutes || 0)},{' '}
            {weekDaysText(v.weekDays).toLowerCase()}, từ {v.startDate?.format('DD/MM')}
            {v.endDate ? ` đến ${v.endDate.format('DD/MM/YYYY')}` : ' cho tới khi bạn dừng'}
            {total != null ? ` — tổng ${total} lần.` : '.'} Mỗi ngày việc tự hiện trên danh sách của họ, không cần giao lại.
          </div>
        )}
        {error && <Alert type="error" showIcon title={error} />}
      </div>
    </Modal>
  );
}
