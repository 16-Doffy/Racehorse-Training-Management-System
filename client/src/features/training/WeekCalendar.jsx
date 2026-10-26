import { useState } from 'react';
import { Button, Popover, Typography, Tooltip, Empty, Input } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  PlayCircleOutlined,
  EditOutlined,
  ScheduleOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
  FlagOutlined,
  HistoryOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { SESSION_KINDS, OBJECTIVE_LABELS, WEEK_DAYS, PHASE_LABELS, PHASE_SHORT, mondayOf, DONE_STATUSES, canReplay } from './trainingVocab';
import { SESSION_STATUS_LABELS } from './sessionStatus';
import { useClubPolicy, precheckRuleText } from './useClubPolicy';
import SessionDetail from './SessionDetail';
import { useLockedHorseIds } from './useLockedHorses';
import { RaceFormDot } from './RaceForm';
import { fold } from '../../utils/fold';

const { Text } = Typography;

// The colour of a chip's left edge; the words come from the shared status vocabulary.
const STATUS_ACCENT = {
  scheduled: 'border-l-gray-300',
  ready: 'border-l-cyan-500',
  blocked: 'border-l-amber-500',
  in_progress: 'border-l-blue-500',
  completed: 'border-l-emerald-600',
  evaluated: 'border-l-emerald-600',
  aborted: 'border-l-orange-500',
  cancelled: 'border-l-gray-300',
  missed: 'border-l-rose-500',
};
// And its ground, so a week reads at a glance: done green, missed red, running blue, waiting amber or cyan.
const STATUS_FILL = {
  scheduled: 'bg-white',
  ready: 'bg-cyan-50',
  blocked: 'bg-amber-50',
  in_progress: 'bg-blue-50',
  completed: 'bg-emerald-50',
  evaluated: 'bg-emerald-50',
  aborted: 'bg-orange-50',
  cancelled: 'bg-gray-50',
  missed: 'bg-rose-50',
};
const STATUS_TEXT = { missed: 'text-rose-700', blocked: 'text-amber-700', in_progress: 'text-blue-700', ready: 'text-cyan-700' };
const statusMeta = (status) => ({
  label: SESSION_STATUS_LABELS[status] || status,
  accent: STATUS_ACCENT[status] || STATUS_ACCENT.scheduled,
  fill: STATUS_FILL[status] || STATUS_FILL.scheduled,
  text: STATUS_TEXT[status] || 'text-gray-600',
});

const slotLabel = (scheduledAt) => (dayjs(scheduledAt).hour() < 12 ? 'Sáng' : 'Chiều');
const slotOf = (scheduledAt) => (dayjs(scheduledAt).hour() < 12 ? 'morning' : 'afternoon');

/**
 * What the plan has for a day, like the server's timetable (trainingPlan.service generatePlanWeek):
 * { race } on race day, the trial about a week before it, else the week template of the phase the day
 * falls in; nothing outside the plan. Entries: [{ slot, kind, at }].
 */
function plannedFor(plan, date) {
  const race = plan.targetRace && plan.targetRace.status !== 'withdrawn' ? plan.targetRace : null;
  if (race && date.isSame(dayjs(race.raceDate), 'day')) return { race, entries: [] };
  const phases = plan.phases || [];
  if (!phases.length || date.isBefore(dayjs(phases[0].startDate), 'day') || date.isAfter(dayjs(phases[phases.length - 1].endDate), 'day')) return { entries: [] };
  const clock = { morning: plan.sessionTime || '07:30', afternoon: plan.afternoonTime || '16:00' };
  const at = (slot) => dayjs(`${date.format('YYYY-MM-DD')}T${clock[slot]}`);
  const trialDay = plan.progress?.form?.trialDay;
  if (trialDay && date.isSame(dayjs(trialDay), 'day')) return { entries: [{ slot: 'morning', kind: 'trial', at: at('morning') }] };
  const phase = phases.find((p) => !date.isBefore(dayjs(p.startDate), 'day') && !date.isAfter(dayjs(p.endDate), 'day'));
  const entries = (phase?.week || [])
    .filter((w) => w.day === date.day() && w.kind !== 'trial')
    .map((w) => ({ slot: w.slot || 'morning', kind: w.kind, at: at(w.slot || 'morning') }));
  return { entries };
}

/** A session the plan will book, not booked yet (the timetable books this week and next): one dashed line. */
function PlannedChip({ entry }) {
  const kind = SESSION_KINDS[entry.kind];
  return (
    <Tooltip title={`Dự kiến: ${kind?.label || 'Buổi tập'} ${entry.at.format('HH:mm')}, theo lịch tuần mẫu của kế hoạch. Được xếp tự động khi tới tuần này hoặc tuần sau.`}>
      <div className="flex w-full items-center justify-between gap-1 rounded-md border border-dashed border-black/15 px-1.5 py-0.5 text-[11px] text-gray-500">
        <span className="truncate">{kind?.short || kind?.label || 'Buổi tập'}</span>
        <span className="shrink-0 tabular-nums">{entry.at.format('HH:mm')}</span>
      </div>
    </Tooltip>
  );
}

function SessionChip({ session, replaced = [], onStart, onPreCheck, onEvaluate, onSchedule, onCancel, onEnd, onAbort, onRequestExam, onReplay, starting, scheduling }) {
  const policy = useClubPolicy();
  const [open, setOpen] = useState(false);
  const kind = SESSION_KINDS[session.kind];
  const status = statusMeta(session.status);
  const met = session.outcome?.met;
  const canChangeTime = ['scheduled', 'ready', 'blocked'].includes(session.status);
  const canReschedule = session.status === 'missed' && !session.rescheduledTo;
  const rescheduled = session.status === 'missed' && Boolean(session.rescheduledTo);
  const callout = (tone, text) => <div className={`rounded-md px-2 py-1.5 text-xs ${tone}`}>{text}</div>;
  const notes = (
    <>
      {session.status === 'in_progress' && session.metrics?.distance ? callout('bg-blue-50 text-blue-800', `Đang chạy · đã được ${Number(session.metrics.distance).toLocaleString('vi-VN')} m`) : null}
      {session.status === 'missed' &&
        callout(
          'bg-gray-50 text-gray-600',
          `${session.missedReason || 'Không kiểm tra sẵn sàng hoặc bắt đầu trong thời hạn của buổi tập.'}${rescheduled ? ' Buổi cũ giữ trong lịch sử; buổi mới đã có trong lịch.' : ''}`
        )}
      {session.status === 'cancelled' && session.cancelReason && callout('bg-red-50 text-red-700', `Lý do hủy: ${session.cancelReason}`)}
      {session.status === 'blocked' && session.blockedReason && callout('bg-amber-50 text-amber-800', session.blockedReason)}
      {replaced.length > 0 &&
        callout('bg-gray-50 text-gray-600', `Thay cho ${replaced.length} buổi đã hủy${replaced.some((s) => s.cancelReason) ? `: ${replaced.map((s) => s.cancelReason).filter(Boolean).join('; ')}` : ''}.`)}
      {canChangeTime && <Text type="secondary" className="!text-[11px] leading-snug">{precheckRuleText(policy)}</Text>}
    </>
  );
  const actions = (
    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2.5 mt-2" onClickCapture={() => setOpen(false)}>
      {['scheduled', 'blocked'].includes(session.status) && (
        <Button size="small" type="primary" icon={<SafetyCertificateOutlined />} onClick={() => onPreCheck(session)}>
          {session.status === 'blocked' ? 'Kiểm tra lại' : 'Kiểm tra sẵn sàng'}
        </Button>
      )}
      {session.status === 'blocked' && onRequestExam && (
        <Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => onRequestExam(session)}>
          Yêu cầu bác sĩ khám
        </Button>
      )}
      {session.status === 'ready' && (
        <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={starting} onClick={() => onStart(session)}>
          Bắt đầu
        </Button>
      )}
      {session.status === 'in_progress' && onEnd && (
        <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => onEnd(session)}>
          Kết thúc
        </Button>
      )}
      {session.status === 'in_progress' && onAbort && (
        <Button size="small" danger icon={<PauseCircleOutlined />} onClick={() => onAbort(session)}>
          Dừng giữa chừng
        </Button>
      )}
      {DONE_STATUSES.includes(session.status) && (
        <Button size="small" type={session.status === 'completed' ? 'primary' : 'default'} icon={<EditOutlined />} onClick={() => onEvaluate(session)}>
          {session.status === 'completed' ? 'Đánh giá' : 'Sửa đánh giá'}
        </Button>
      )}
      {onReplay && canReplay(session) && (
        <Button size="small" icon={<HistoryOutlined />} onClick={() => onReplay(session)}>
          Xem lại buổi chạy
        </Button>
      )}
      {onSchedule && canReschedule && (
        <Button size="small" type="primary" icon={<ScheduleOutlined />} loading={scheduling} onClick={() => onSchedule(session)}>
          Xếp lại lịch
        </Button>
      )}
      {onSchedule && canChangeTime && (
        <Button size="small" icon={<ScheduleOutlined />} loading={scheduling} onClick={() => onSchedule(session)}>
          Đổi giờ
        </Button>
      )}
      {onCancel && canChangeTime && (
        <Button size="small" danger icon={<StopOutlined />} onClick={() => onCancel(session)}>
          Hủy buổi
        </Button>
      )}
    </div>
  );
  const detail = <SessionDetail session={session} statusLabel={rescheduled ? 'Đã xếp lại lịch' : status.label} notes={notes} actions={actions} />;

  // White chip, its status on the left edge: the work and its result, then the time (and the status
  // in words while it still needs something). The border is not one the dark canvas recolours, so the
  // edge keeps its colour there.
  return (
    <Popover content={detail} trigger="click" placement="bottom" open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label={`${kind?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập'}, ${slotLabel(session.scheduledAt)} ${dayjs(session.scheduledAt).format('HH:mm')}, ${rescheduled ? 'Đã xếp lại lịch' : status.label}`}
        className={`w-full cursor-pointer rounded-md border border-black/10 border-l-[3px] ${status.accent} ${status.fill} px-1.5 py-0.5 text-left transition-shadow hover:shadow-xs ${session.status === 'cancelled' ? 'opacity-60 line-through' : ''}`}
      >
        <div className="flex items-center justify-between gap-1 text-[11px]">
          <span className="truncate font-semibold text-gray-900">{kind?.short || kind?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập'}</span>
          <span className="shrink-0 tabular-nums text-gray-500">{dayjs(session.scheduledAt).format('HH:mm')}</span>
        </div>
        {/* A second line only for what needs a look: its result, or a state still waiting on someone. */}
        {(met != null || ['missed', 'blocked', 'in_progress', 'ready'].includes(session.status)) && (
          <div className="truncate text-[10px] font-medium leading-tight">
            {met === true && <span className="text-emerald-700">Đạt</span>}
            {met === false && <span className="text-rose-700">Chưa đạt</span>}
            {met == null && <span className={rescheduled ? 'text-gray-600' : status.text}>{rescheduled ? 'Đã xếp lại' : status.label}</span>}
          </div>
        )}
      </button>
    </Popover>
  );
}

/**
 * A week of training: one row per horse, one column per day (Monday first). A row whose horse
 * follows an active plan can book its week from the plan's template. `toolbar` (the page's view and
 * filter switches) shares the row of the week picker.
 */
export default function WeekCalendar({
  toolbar = null,
  weekStart,
  onWeekChange,
  sessions = [],
  plans = [],
  onGenerate,
  generatingPlanId,
  onStart,
  onPreCheck,
  startingId,
  onEvaluate,
  onSchedule,
  onCancel,
  onEnd,
  onAbort,
  onRequestExam,
  onReplay,
  schedulingId,
}) {
  const days = WEEK_DAYS.map((w, i) => ({ ...w, date: weekStart.add(i, 'day') }));
  const weekEnd = weekStart.add(7, 'day');
  const inWeek = sessions
    .filter((s) => {
      const t = dayjs(s.scheduledAt);
      return !t.isBefore(weekStart) && t.isBefore(weekEnd);
    })
    .sort((a, b) => dayjs(a.scheduledAt).valueOf() - dayjs(b.scheduledAt).valueOf());
  const activePlanByHorse = new Map(plans.filter((p) => p.status === 'active').map((p) => [String(p.horse?._id), p]));

  const rows = new Map();
  for (const p of activePlanByHorse.values()) rows.set(String(p.horse._id), { horse: p.horse, plan: p });
  for (const s of inWeek) {
    const key = String(s.horse?._id);
    if (!rows.has(key)) rows.set(key, { horse: s.horse, plan: activePlanByHorse.get(key) });
  }
  const isThisWeek = weekStart.isSame(mondayOf(dayjs()), 'day');
  const lockedIds = useLockedHorseIds();
  const [search, setSearch] = useState('');
  // A club has many horses: one short line each, found by name, those with work this week first.
  const booked = new Set(inWeek.map((s) => String(s.horse?._id)));
  const weight = ({ horse, plan }) => {
    const id = String(horse?._id);
    if (booked.has(id)) return 0;
    if (plan && !lockedIds.has(id)) return 1;
    return plan ? 2 : 3;
  };
  const shown = [...rows.values()]
    .filter(({ horse }) => !search.trim() || fold(horse?.name).includes(fold(search.trim())))
    .sort((a, b) => weight(a) - weight(b) || (a.horse?.name || '').localeCompare(b.horse?.name || '', 'vi'));

  return (
    <div>
      {/* One row: the page's own switches (`toolbar`), the horse search, the week. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          {toolbar}
          <Input allowClear prefix={<SearchOutlined className="text-gray-400" />} placeholder="Tìm ngựa" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-44" aria-label="Tìm ngựa trong lịch tuần" />
        </div>
        <div className="light-surface-box flex flex-wrap items-center gap-1.5">
          <Button size="small" icon={<LeftOutlined />} aria-label="Tuần trước" onClick={() => onWeekChange(weekStart.subtract(7, 'day'))} />
          <Text strong className="px-1 text-sm tabular-nums text-gray-800">
            {weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}
          </Text>
          <Button size="small" icon={<RightOutlined />} aria-label="Tuần sau" onClick={() => onWeekChange(weekStart.add(7, 'day'))} />
          {!isThisWeek && (
            <Button size="small" type="link" className="!px-1 text-xs" onClick={() => onWeekChange(null)}>
              Về tuần này
            </Button>
          )}
          <span className="pl-1 text-xs tabular-nums text-gray-500">
            {rows.size} ngựa, {inWeek.length} buổi
          </span>
        </div>
      </div>

      {rows.size === 0 ? (
        <Empty description="Tuần này chưa có buổi tập nào." />
      ) : !shown.length ? (
        <p className="light-surface-box m-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">Không có ngựa nào tên “{search}”.</p>
      ) : (
        // Scrolls inside its frame when the club is large: the day row and the horse column stay put.
        <div className="light-surface-box max-h-[calc(100vh-230px)] min-h-[240px] overflow-auto rounded-xl border border-[#E5DEC9] bg-white shadow-xs">
          <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="wc-sticky sticky left-0 top-0 z-[3] w-[220px] border-b border-[#E5DEC9] bg-[#FAF7F0] px-3 py-2 text-left text-xs font-semibold text-gray-700">Ngựa</th>
                {days.map((d) => {
                  const today = d.date.isSame(dayjs(), 'day');
                  return (
                    <th key={d.day} className={`wc-sticky sticky top-0 z-[2] border-b px-1.5 py-2 text-left text-xs ${today ? 'border-[#0F5A43] bg-[#DCEFE3] font-bold text-[#0F5A43]' : 'border-[#E5DEC9] bg-[#FAF7F0] font-semibold text-gray-600'}`}>
                      <span>{d.short}</span> <span className={`tabular-nums ${today ? '' : 'font-normal text-gray-500'}`}>{d.date.format('DD/MM')}</span>
                      {today && <span className="ml-1 inline-block whitespace-nowrap rounded bg-[#0F5A43] px-1 py-px text-[10px] font-semibold text-white">Hôm nay</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map(({ horse, plan }) => {
                const locked = lockedIds.has(String(horse?._id));
                const raceInDays = plan?.targetRace && plan.targetRace.status !== 'withdrawn' ? plan.progress?.raceInDays : null;
                return (
                  <tr key={horse?._id} className="group align-top">
                    {/* The horse on one line (its race form a dot), what it is building to on a second, small. */}
                    <td className="wc-sticky sticky left-0 z-[1] bg-white px-3 py-1.5 group-hover:bg-[#FAF7F0]">
                      <div className="flex items-center gap-1.5">
                        <RaceFormDot form={plan?.progress?.form} />
                        <Link to={`?horse=${horse?._id}`} title="Xem lịch của riêng ngựa này" className="min-w-0 truncate text-[13px] font-semibold text-emerald-950 hover:text-emerald-700">
                          {horse?.name}
                        </Link>
                        {plan && (
                          <Tooltip
                            title={
                              locked
                                ? 'Bác sĩ đang khóa tập: không xếp được buổi nào. Khi bác sĩ cho tập lại, lịch theo kế hoạch được xếp lại tự động.'
                                : 'Xếp lại tuần: các buổi còn trống của tuần đang xem, kể cả buổi đã hủy, theo lịch tuần mẫu (tuần này và tuần sau vốn được xếp tự động).'
                            }
                          >
                            <Button
                              size="small"
                              type="text"
                              icon={<ScheduleOutlined />}
                              aria-label="Xếp lại tuần"
                              loading={generatingPlanId === plan._id}
                              disabled={locked}
                              onClick={() => onGenerate(plan, weekStart)}
                              className="!ml-auto !h-6 !w-6 shrink-0 !text-gray-500"
                            />
                          </Tooltip>
                        )}
                      </div>
                      <div className="flex min-w-0 items-center gap-x-2 truncate text-[11px] leading-snug text-gray-500">
                        {plan ? <span className="truncate">{PHASE_SHORT[plan.phase] || PHASE_LABELS[plan.phase] || plan.phase}</span> : <span>Không có kế hoạch</span>}
                        {locked && <span className="shrink-0 font-medium text-rose-700">Đang khóa tập</span>}
                        {raceInDays != null && raceInDays >= 0 && (
                          <Tooltip title={`${plan.targetRace.raceName}, ${dayjs(plan.targetRace.raceDate).format('DD/MM')}`}>
                            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-pink-700">
                              <FlagOutlined className="text-[10px]" />
                              {raceInDays === 0 ? 'Hôm nay đua' : `${raceInDays} ngày tới giải`}
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    {days.map((d) => {
                      const cell = inWeek.filter((s) => String(s.horse?._id) === String(horse?._id) && dayjs(s.scheduledAt).isSame(d.date, 'day'));
                      const live = cell.filter((s) => s.status !== 'cancelled');
                      const list = cell.filter((s) => s.status !== 'cancelled' || !live.some((l) => slotOf(l.scheduledAt) === slotOf(s.scheduledAt)));
                      const replaced = cell.filter((s) => !list.includes(s));
                      const { entries, race } = plan && !d.date.isBefore(dayjs(), 'day') ? plannedFor(plan, d.date) : { entries: [] };
                      const due = entries.filter((e) => e.at.isAfter(dayjs()) && !cell.some((s) => slotOf(s.scheduledAt) === e.slot));
                      const planned = locked ? [] : due;
                      const today = d.date.isSame(dayjs(), 'day');
                      return (
                        <td key={d.day} className={`px-1 py-1.5 ${today ? 'bg-emerald-50/70' : d.date.isBefore(dayjs(), 'day') ? 'bg-black/[0.015]' : ''}`}>
                          <div className="flex flex-col gap-1">
                            {list.map((s) => (
                              <SessionChip
                                key={s._id}
                                session={s}
                                replaced={replaced.filter((r) => slotOf(r.scheduledAt) === slotOf(s.scheduledAt))}
                                onStart={onStart}
                                onPreCheck={onPreCheck}
                                onEvaluate={onEvaluate}
                                onSchedule={onSchedule}
                                onCancel={onCancel}
                                onEnd={onEnd}
                                onAbort={onAbort}
                                onRequestExam={onRequestExam}
                                onReplay={onReplay}
                                starting={startingId === s._id}
                                scheduling={schedulingId === s._id}
                              />
                            ))}
                            {race && (
                              <span className="flex items-center gap-1 rounded-md border border-pink-200 bg-pink-50 px-1.5 py-0.5 text-[11px] font-semibold text-pink-700">
                                <FlagOutlined /> Ngày đua
                              </span>
                            )}
                            {planned.map((e) => (
                              <PlannedChip key={e.slot} entry={e} />
                            ))}
                            {locked && due.length > 0 && !live.length && <span className="py-0.5 pl-1 text-[11px] font-medium text-rose-700">Khóa tập</span>}
                            {/* A rest day: a faint dash, not the same word forty times over the week. */}
                            {!list.length && !planned.length && !race && !(locked && due.length) && (
                              <div className="select-none text-center text-xs leading-6 text-gray-300" title="Nghỉ">
                                <span aria-hidden="true">—</span>
                                <span className="sr-only">Nghỉ</span>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="m-0 mt-1.5 text-[11px] text-gray-500">
        Viền nét đứt: buổi dự kiến theo kế hoạch, chưa xếp. Chấm cạnh tên: phong độ dự giải (rê chuột để xem).
      </p>
    </div>
  );
}
