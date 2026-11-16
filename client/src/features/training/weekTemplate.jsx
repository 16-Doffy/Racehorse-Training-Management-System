import { useState } from 'react';
import { Button, Segmented, Select, Tooltip } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import TemplateDayModal from './TemplateDayModal';
import { useClubPolicy } from './useClubPolicy';
import { phaseGuide } from './planGuide';
import {
  AFTERNOON_KINDS,
  INTENSITY_LABELS,
  PHASE_LABELS,
  PHASE_SHORT,
  PRESETS_BY_KIND,
  SESSION_KINDS,
  WEEK_DAYS,
  WORKOUT_PRESETS,
  defaultPreset,
  mainWorkLine,
  partsTimeline,
  presetOf,
  presetSegments,
  segmentMetres,
} from './trainingVocab';

export const REST = 'rest';
// The trial is the race's rehearsal, booked once before race day — never a weekly session.
export const TEMPLATE_KINDS = Object.keys(SESSION_KINDS).filter((k) => k !== 'trial');
// Ready-made sessions for the afternoon: the light, short ones (the club keeps the afternoon light).
const AFTERNOON_PRESETS = ['afternoon_walk', 'afternoon_trot', 'afternoon_canter', 'walk'];
export const slotOf = (d) => d.slot || 'morning';
const kmText = (km) => km.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const DAY_NAMES = { 0: 'Chủ nhật', 1: 'Thứ 2', 2: 'Thứ 3', 3: 'Thứ 4', 4: 'Thứ 5', 5: 'Thứ 6', 6: 'Thứ 7' };

/**
 * Kilometres a phase's normal week gallops (canter, hill, breeze): the weekly volume trainers count.
 * Walking and trotting around the work are not in it.
 */
export function weekKm(week = []) {
  const metres = week.reduce((n, d) => {
    if (d.segments?.length) return n + d.segments.reduce((m, s) => m + (s.kind === 'walk' ? 0 : segmentMetres(s)), 0);
    if (d.kind === 'walk') return n;
    const k = SESSION_KINDS[d.kind]?.prescription || {};
    return n + (d.distanceM ?? k.distanceM ?? 0) * (d.reps ?? k.reps ?? 1);
  }, 0);
  return Math.round(metres / 100) / 10;
}

/** A template day as a workout in parts: its own parts, else the kind's usual ready-made workout. */
export const withParts = (d) => (d.segments?.length || !defaultPreset(d.kind, slotOf(d)) ? d : { ...d, segments: presetSegments(defaultPreset(d.kind, slotOf(d))) });
/** A recommended day (planGuide.js): its ready-made workout, by name. */
export const fromPreset = ({ day, slot = 'morning', preset }) => ({ day, slot, kind: WORKOUT_PRESETS[preset].kind, segments: presetSegments(preset) });
/** The phase's recommended week for this race distance, in parts, or null. */
export const recommendedWeek = (distance, key) => phaseGuide(distance, key)?.recommendedWeek?.map(fromPreset) || null;

/** The ready-made sessions among `names`, grouped by kind, with their minutes for the list. */
function programOptions(names) {
  return Object.entries(PRESETS_BY_KIND)
    .map(([kind, list]) => ({
      label: SESSION_KINDS[kind].label,
      options: list.filter((n) => names.includes(n)).map((n) => ({ value: n, label: WORKOUT_PRESETS[n].label, minutes: partsTimeline(WORKOUT_PRESETS[n].segments).minutes })),
    }))
    .filter((g) => g.options.length);
}

/** The parts of a session on the clock, for a tooltip: "07:30 Đi bộ khởi động (15')" … "09:06 Kết thúc". */
function PartsDetail({ timeline }) {
  return (
    <div className="text-xs leading-5">
      {timeline.parts.map(({ at, minutes, part }, i) => (
        <div key={i}>
          <span className="tabular-nums opacity-70">{at}</span> {part.note || SESSION_KINDS[part.kind]?.short} ({part.kind !== 'walk' && part.distanceM ? `${part.distanceM} m` : `${minutes}'`})
        </div>
      ))}
      <div>
        <span className="tabular-nums opacity-70">{timeline.end}</span> Kết thúc
      </div>
    </div>
  );
}

/** A session's hours and main work, two short lines; the parts on hover. */
function SessionSummary({ day, start }) {
  const timeline = day?.segments?.length ? partsTimeline(day.segments, start) : null;
  if (!timeline) return <span className="text-xs text-gray-500">{start}</span>;
  return (
    <Tooltip title={<PartsDetail timeline={timeline} />} placement="bottomLeft">
      <div className="min-w-0 cursor-default pt-px leading-tight">
        <div className="text-xs font-medium tabular-nums text-gray-800">
          {start} – {timeline.end}
        </div>
        <div className="truncate text-[11px] text-gray-500">{mainWorkLine(day.segments)}</div>
      </div>
    </Tooltip>
  );
}

/** One session of a template day, editable: the ready-made session, its hours and main work, the pencil. */
function SessionPlan({ day, start, programs, onProgram, onEdit, emptyLabel = 'Nghỉ' }) {
  const value = !day ? REST : (day.segments?.length && presetOf(day.segments)) || 'custom';
  const options = [
    { value: REST, label: <span className="text-gray-400">{emptyLabel}</span> },
    ...(value === 'custom' ? [{ value: 'custom', label: `Tự chỉnh (${SESSION_KINDS[day.kind]?.short || day.kind})` }] : []),
    ...programs,
  ];
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Select
        size="small"
        className="!w-48 shrink-0"
        value={value}
        onChange={(v) => v !== 'custom' && onProgram(v)}
        options={options}
        popupMatchSelectWidth={false}
        aria-label="Bài tập"
        optionRender={(o) => (
          <div className="flex items-center justify-between gap-4">
            <span>{o.label}</span>
            {o.data.minutes ? <span className="text-xs tabular-nums text-gray-400">{o.data.minutes}'</span> : null}
          </div>
        )}
      />
      {day && <SessionSummary day={day} start={start} />}
      {day && (
        <Tooltip title="Xem & sửa từng phần">
          <Button size="small" type="text" className="!ml-auto shrink-0" icon={<EditOutlined />} onClick={onEdit} aria-label="Sửa chi tiết buổi tập" />
        </Tooltip>
      )}
    </div>
  );
}

const GRID = 'grid grid-cols-[44px_minmax(0,1.25fr)_minmax(0,1fr)] gap-6';

/** One phase's normal week to read: a row per day, the morning and the afternoon with their hours and work. */
export function WeekTimetable({ phase, sessionTime = '07:30', afternoonTime = '16:00' }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className={`${GRID} border-b border-gray-100 px-3 py-1.5 text-xs text-gray-500`}>
          <span>Ngày</span>
          <span>Buổi sáng</span>
          <span>Buổi chiều</span>
        </div>
        {WEEK_DAYS.map((w, wi) => {
          const cell = (slot) => {
            const d = (phase?.week || []).find((x) => x.day === w.day && slotOf(x) === slot);
            if (!d) return <span className="text-xs text-gray-300">—</span>;
            const name = (d.segments?.length && WORKOUT_PRESETS[presetOf(d.segments)]?.label) || SESSION_KINDS[d.kind]?.label || d.kind;
            return (
              <div className="flex min-w-0 items-start gap-3">
                <span className="w-36 shrink-0 truncate text-[13px] font-medium text-gray-900">{name}</span>
                <SessionSummary day={d} start={slot === 'afternoon' ? afternoonTime : sessionTime} />
              </div>
            );
          };
          return (
            <div key={w.day} className={`${GRID} items-start px-3 py-2 ${wi ? 'border-t border-gray-100' : ''}`}>
              <div className="text-sm font-medium text-gray-800">{w.short}</div>
              {cell('morning')}
              {cell('afternoon')}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The phases' normal weeks, edited one phase at a time: a tab per phase, its week as a timetable (a row
 * per day, a ready-made session or one changed part by part for the morning and the afternoon), the
 * week's gallop against the phase's target, and its recommended week. `ranges[i]`: { start, end } of
 * phase i, when known. `onChange(phases)` gets the whole list.
 */
export function PhaseWeekEditor({ phases, onChange, phaseIndex = 0, onPhaseIndex, sessionTime = '07:30', afternoonTime = '16:00', guideDistance, ranges = [] }) {
  const policy = useClubPolicy();
  const [editing, setEditing] = useState(null);
  const shown = Math.min(phaseIndex, Math.max(0, phases.length - 1));
  const phase = phases[shown];
  if (!phase) return null;
  const guide = phaseGuide(guideDistance, phase.key);
  const afternoonKinds = policy.afternoonLightOnly ? AFTERNOON_KINDS : TEMPLATE_KINDS;
  const morningPrograms = programOptions(Object.keys(WORKOUT_PRESETS).filter((n) => !n.startsWith('afternoon_')));
  const afternoonPrograms = programOptions(AFTERNOON_PRESETS.filter((n) => afternoonKinds.includes(WORKOUT_PRESETS[n].kind)));
  const setWeek = (i, week) => onChange(phases.map((p, j) => (j === i ? { ...p, week } : p)));
  const setProgram = (day, slot, name) => {
    const week = phase.week.filter((d) => !(d.day === day && slotOf(d) === slot));
    setWeek(shown, name === REST ? week : [...week, fromPreset({ day, slot, preset: name })]);
  };
  const recommended = recommendedWeek(guideDistance, phase.key);
  const range = ranges[shown];

  return (
    <div className="flex flex-col gap-3">
      {phases.length > 1 && (
        <div className="overflow-x-auto">
          <Segmented
            value={shown}
            onChange={onPhaseIndex}
            options={phases.map((p, i) => ({
              value: i,
              label: (
                <div className="px-1 py-0.5 text-left leading-tight">
                  <div className="text-[13px] font-medium">{PHASE_SHORT[p.key] || PHASE_LABELS[p.key]}</div>
                  <div className="text-[11px] text-gray-500">
                    {p.weeks} tuần · {(p.week || []).length} buổi
                  </div>
                </div>
              ),
            }))}
          />
        </div>
      )}

      <div className="rounded-lg border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
          <div className="text-sm font-medium text-gray-900">
            <Tooltip title={guide ? `Gợi ý: ${guide.sessionsPerWeek} · ${guide.speedKmh} · nhịp tim ≤ ${guide.hrMax} bpm` : null}>
              <span className="cursor-default">{PHASE_LABELS[phase.key]}</span>
            </Tooltip>
            <span className="ml-2 font-normal tabular-nums text-gray-500">
              {range ? `${dayjs(range.start).format('DD/MM')} – ${dayjs(range.end).format('DD/MM')} · ` : ''}
              {INTENSITY_LABELS[phase.intensity] || ''}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Tooltip title="Quãng phi trong tuần (phi chậm, tập dốc, phi nhanh); không tính đi bộ và chạy kiệu.">
              <span className="text-xs tabular-nums text-gray-600">
                Quãng phi/tuần <b className="text-gray-900">{kmText(weekKm(phase.week))}</b>
                {phase.weeklyVolumeKm ? <span className="text-gray-400"> / {phase.weeklyVolumeKm} km mục tiêu</span> : ' km'}
              </span>
            </Tooltip>
            {recommended && (
              <Button size="small" onClick={() => setWeek(shown, recommended)}>
                Dùng tuần gợi ý
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className={`${GRID} border-b border-gray-100 px-3 py-1.5 text-xs text-gray-500`}>
              <span>Ngày</span>
              <span>Buổi sáng · {sessionTime}</span>
              <span>Buổi chiều · {afternoonTime}</span>
            </div>
            {WEEK_DAYS.map((w, wi) => {
              const morning = phase.week.find((x) => x.day === w.day && slotOf(x) === 'morning');
              const afternoon = phase.week.find((x) => x.day === w.day && slotOf(x) === 'afternoon');
              return (
                <div key={w.day} className={`${GRID} items-start px-3 py-2 ${wi ? 'border-t border-gray-100' : ''}`}>
                  <div className="pt-0.5 text-sm font-medium text-gray-800">{w.short}</div>
                  <SessionPlan
                    day={morning}
                    start={sessionTime}
                    programs={morningPrograms}
                    onProgram={(name) => setProgram(w.day, 'morning', name)}
                    onEdit={() => setEditing({ day: w.day, slot: 'morning' })}
                  />
                  {afternoon ? (
                    <SessionPlan
                      day={afternoon}
                      start={afternoonTime}
                      programs={afternoonPrograms}
                      onProgram={(name) => setProgram(w.day, 'afternoon', name)}
                      onEdit={() => setEditing({ day: w.day, slot: 'afternoon' })}
                      emptyLabel="Không tập chiều"
                    />
                  ) : (
                    <div>
                      <Button size="small" type="text" className="!text-gray-400 hover:!text-gray-700" icon={<PlusOutlined />} onClick={() => setProgram(w.day, 'afternoon', 'afternoon_walk')}>
                        Thêm
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {shown < phases.length - 1 && onPhaseIndex && (
        <div className="flex justify-end">
          <Button size="small" type="link" onClick={() => onPhaseIndex(shown + 1)}>
            Giai đoạn tiếp: {PHASE_LABELS[phases[shown + 1].key]} →
          </Button>
        </div>
      )}

      {editing &&
        (() => {
          const d = phase.week.find((x) => x.day === editing.day && slotOf(x) === editing.slot);
          if (!d) return null;
          return (
            <TemplateDayModal
              open
              title={`${PHASE_LABELS[phase.key]} · ${DAY_NAMES[editing.day]} · buổi ${editing.slot === 'afternoon' ? 'chiều' : 'sáng'}`}
              slot={editing.slot}
              day={d}
              kinds={editing.slot === 'afternoon' ? afternoonKinds : TEMPLATE_KINDS}
              start={editing.slot === 'afternoon' ? afternoonTime : sessionTime}
              onClose={() => setEditing(null)}
              onSave={({ kind, segments }) => {
                setWeek(
                  shown,
                  phase.week.map((y) => (y.day === editing.day && slotOf(y) === editing.slot ? { day: y.day, slot: editing.slot, kind, segments } : y))
                );
                setEditing(null);
              }}
            />
          );
        })()}
    </div>
  );
}
