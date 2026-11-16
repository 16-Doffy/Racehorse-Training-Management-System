import { Button, Input, InputNumber, Select, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { KIND_SPEED_RANGES, SESSION_KINDS, WORKOUT_PRESETS, partsTimeline, presetSegments, segmentSafetyWarnings, segmentsTotals } from './trainingVocab';

// The server keeps at most this many parts in a day of the week template.
export const MAX_PARTS = 8;
// Number, kind, minutes, metres, pace, heart rate, note, buttons — on a phone: four to a line.
const COLS = 'grid-cols-4 items-center gap-1.5 sm:grid-cols-[20px_128px_84px_90px_90px_84px_minmax(0,1fr)_76px] sm:gap-2';
// With the clock: each part's start time in the first column.
const COLS_TIMED = 'grid-cols-4 items-center gap-1.5 sm:grid-cols-[40px_128px_84px_90px_90px_84px_minmax(0,1fr)_76px] sm:gap-2';
const kmText = (m) => (Math.round(m / 100) / 10).toLocaleString('vi-VN');
const plain = (list) => JSON.stringify(list.map((s) => [s.kind, Number(s.durationMinutes) || 0, Number(s.distanceM) || 0, Number(s.targetSpeedKmh) || 0]));

const speedProblem = (s) => {
  const range = KIND_SPEED_RANGES[s.kind];
  const v = s.targetSpeedKmh;
  return range && v != null && v !== '' && (v < range[0] || v > range[1]) ? `${SESSION_KINDS[s.kind].short}: tốc độ ${range[0]}–${range[1]} km/h` : null;
};

/** The first thing that stops these parts being saved, as a sentence, or null. */
export function segmentsProblem(parts = [], { kinds } = {}) {
  if (!parts.length) return 'Cần ít nhất một phần.';
  if (parts.length > MAX_PARTS) return `Tối đa ${MAX_PARTS} phần một buổi.`;
  for (const [i, s] of parts.entries()) {
    if (!s.kind) return `Phần ${i + 1}: chọn loại bài.`;
    if (kinds && !kinds.includes(s.kind)) return `Phần ${i + 1}: "${SESSION_KINDS[s.kind]?.label}" không xếp được vào buổi này.`;
    if (!(Number(s.durationMinutes) > 0) && !(Number(s.distanceM) > 0)) return `Phần ${i + 1}: nhập số phút hoặc số mét.`;
    const speed = speedProblem(s);
    if (speed) return `Phần ${i + 1}: ${speed}.`;
  }
  // The same bounds the server puts on a session's totals (PRESCRIPTION_RANGES).
  const minutes = parts.reduce((n, s) => n + (Number(s.durationMinutes) || 0), 0);
  const metres = parts.reduce((n, s) => n + (Number(s.distanceM) || 0), 0);
  if (minutes > 0 && minutes < 5) return 'Cả buổi cần ít nhất 5 phút.';
  if (minutes > 180) return 'Cả buổi tối đa 180 phút.';
  if (metres > 6000) return 'Tổng cự ly các phần tối đa 6000 m.';
  return null;
}

/** "6 phần · 98 phút · phi 4 km": the gallop is the canter and faster, not the walking around it. */
export const partsSummary = (parts = []) => {
  const t = segmentsTotals(parts);
  const gallop = parts.filter((s) => s?.kind && s.kind !== 'walk').reduce((n, s) => n + (Number(s.distanceM) || 0), 0);
  return `${parts.length} phần · ${t.minutes} phút${gallop ? ` · phi ${kmText(gallop)} km` : ''}`;
};

/**
 * A workout in parts, edited row by row: kind, minutes, metres, pace, heart-rate ceiling and a short
 * note, in order (warm-up first, cool-down last). `kinds`: the kinds a part may be; `presets`: names of
 * WORKOUT_PRESETS offered as a starting point (`onPreset(name)`), each enabled unless
 * `presetDisabled(name)` gives a reason.
 */
export default function SegmentsEditor({ value = [], onChange, kinds, presets = [], onPreset, presetDisabled = () => null, start = null }) {
  const parts = value || [];
  // `start`: the session's clock — each part then shows when it begins.
  const timeline = start ? partsTimeline(parts, start) : null;
  const cols = start ? COLS_TIMED : COLS;
  const set = (i, patch) => onChange(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i, d) => {
    const next = [...parts];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const setKind = (i, kind) => {
    const range = KIND_SPEED_RANGES[kind];
    const speed = parts[i].targetSpeedKmh;
    const fits = speed == null || (range && speed >= range[0] && speed <= range[1]);
    set(i, { kind, ...(fits ? {} : { targetSpeedKmh: SESSION_KINDS[kind]?.prescription?.targetSpeedKmh }) });
  };
  const warnings = segmentSafetyWarnings(parts);
  const active = presets.find((name) => plain(presetSegments(name)) === plain(parts));
  const presetOptions = kinds
    .map((kind) => ({
      label: SESSION_KINDS[kind].label,
      options: presets
        .filter((n) => WORKOUT_PRESETS[n].kind === kind)
        .map((n) => ({ value: n, label: WORKOUT_PRESETS[n].label, disabled: Boolean(presetDisabled(n)), title: presetDisabled(n) || undefined })),
    }))
    .filter((g) => g.options.length);

  return (
    <div className="flex flex-col gap-3">
      {presetOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">Mẫu có sẵn</span>
          <Select className="w-64" value={active} placeholder="Tự chỉnh — chọn mẫu để điền lại" options={presetOptions} onChange={(name) => onPreset?.(name)} aria-label="Mẫu bài có sẵn" />
        </div>
      )}

      <div className="rounded-lg border border-gray-200">
        <div className={`${cols} hidden border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-500 sm:grid`}>
          <span>{start ? 'Giờ' : '#'}</span>
          <span>Loại bài</span>
          <span>Thời lượng</span>
          <span>Cự ly</span>
          <span>Tốc độ</span>
          <span>Nhịp tim ≤</span>
          <span>Ghi chú</span>
          <span />
        </div>
        {parts.map((s, i) => {
          const missing = !(Number(s.durationMinutes) > 0) && !(Number(s.distanceM) > 0);
          const badSpeed = speedProblem(s);
          return (
            <div key={i} className={`${cols} grid px-2 py-1.5 ${i ? 'border-t border-gray-100' : ''}`}>
              <span className="text-xs tabular-nums text-gray-500">{timeline ? timeline.parts[i]?.at : i + 1}</span>
              <Select
                size="small"
                className="col-span-3 !w-full sm:col-span-1"
                value={s.kind}
                onChange={(kind) => setKind(i, kind)}
                options={kinds.map((k) => ({ value: k, label: SESSION_KINDS[k].short }))}
                aria-label={`Loại bài phần ${i + 1}`}
              />
              <InputNumber size="small" className="!w-full" controls={false} min={1} max={180} suffix="phút" value={s.durationMinutes} status={missing ? 'error' : undefined} onChange={(v) => set(i, { durationMinutes: v ?? undefined })} aria-label={`Số phút phần ${i + 1}`} />
              <InputNumber size="small" className="!w-full" controls={false} min={0} max={10000} step={100} suffix="m" placeholder="—" value={s.distanceM} status={missing ? 'error' : undefined} onChange={(v) => set(i, { distanceM: v || undefined })} aria-label={`Số mét phần ${i + 1}`} />
              <Tooltip title={badSpeed}>
                <InputNumber size="small" className="!w-full" controls={false} min={5} max={80} suffix="km/h" placeholder="—" value={s.targetSpeedKmh} status={badSpeed ? 'error' : undefined} onChange={(v) => set(i, { targetSpeedKmh: v ?? undefined })} aria-label={`Tốc độ phần ${i + 1}`} />
              </Tooltip>
              <InputNumber size="small" className="!w-full" controls={false} min={60} max={240} suffix="bpm" placeholder="—" value={s.targetHeartRateMax} onChange={(v) => set(i, { targetHeartRateMax: v ?? undefined })} aria-label={`Nhịp tim tối đa phần ${i + 1}`} />
              <Input size="small" maxLength={80} value={s.note} placeholder="Ghi chú" onChange={(e) => set(i, { note: e.target.value })} className="col-span-3 sm:col-span-1" aria-label={`Ghi chú phần ${i + 1}`} />
              <div className="flex items-center justify-end">
                <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Lên trên" />
                <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === parts.length - 1} onClick={() => move(i, 1)} aria-label="Xuống dưới" />
                <Button size="small" type="text" icon={<DeleteOutlined />} disabled={parts.length === 1} onClick={() => onChange(parts.filter((_, j) => j !== i))} aria-label="Bỏ phần này" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="small" icon={<PlusOutlined />} disabled={parts.length >= MAX_PARTS} onClick={() => onChange([...parts, { kind: kinds.includes('walk') ? 'walk' : kinds[0], durationMinutes: 10, targetSpeedKmh: 7 }])}>
          Thêm phần
        </Button>
        <span className="text-sm tabular-nums text-gray-600">
          {timeline ? `${start} – ${timeline.end} · ` : 'Tổng: '}
          {partsSummary(parts)}
        </span>
      </div>
      {warnings.length > 0 && (
        <div className="text-xs leading-5 text-amber-700">
          {warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
