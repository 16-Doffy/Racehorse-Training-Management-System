import { useState } from 'react';
import { Button, Popover, Typography, Tooltip, Empty, Tag } from 'antd';
import { LeftOutlined, RightOutlined, PlayCircleOutlined, EditOutlined, ScheduleOutlined, SafetyCertificateOutlined, StopOutlined, CheckCircleOutlined, PauseCircleOutlined, FlagOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { SESSION_KINDS, OBJECTIVE_LABELS, WEEK_DAYS, PHASE_LABELS, mondayOf, DONE_STATUSES } from './trainingVocab';
import { SESSION_STATUS_LABELS } from './sessionStatus';
import { useClubPolicy, precheckRuleText } from './useClubPolicy';
import SessionDetail from './SessionDetail';
import { useLockedHorseIds } from './useLockedHorses';
import { RaceFormTag } from './RaceForm';

const { Text } = Typography;

// The colour of the dot; the words come from the shared status vocabulary.
const STATUS_DOT = {
  scheduled: 'bg-gray-400',
  ready: 'bg-cyan-500',
  blocked: 'bg-amber-500',
  in_progress: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-600',
  evaluated: 'bg-green-600',
  aborted: 'bg-orange-500',
  cancelled: 'bg-red-500',
  missed: 'bg-gray-400',
};
const statusMeta = (status) => ({ label: SESSION_STATUS_LABELS[status] || status, dot: STATUS_DOT[status] || STATUS_DOT.scheduled });

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

/** A session the plan will book, not booked yet (the timetable books this week and next). */
function PlannedChip({ entry }) {
  return (
    <Tooltip title="Theo lịch tuần mẫu của kế hoạch: được xếp tự động khi tới tuần này hoặc tuần sau.">
      <div className="w-full rounded-lg border border-dashed border-gray-300 px-2 py-1.5 text-left">
        <div className="font-semibold text-xs text-gray-600 truncate">{SESSION_KINDS[entry.kind]?.label || 'Buổi tập'}</div>
        <div className="mt-1 text-[11px] text-gray-500 tabular-nums">
          {entry.slot === 'morning' ? 'Sáng' : 'Chiều'} {entry.at.format('HH:mm')} · Dự kiến
        </div>
      </div>
    </Tooltip>
  );
}

function SessionChip({ session, onStart, onPreCheck, onEvaluate, onSchedule, onCancel, onEnd, onAbort, onRequestExam, starting, scheduling }) {
  const policy = useClubPolicy();
  // Controlled so an action closes it: the dialog it opens must not sit under the card's details.
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
      {canChangeTime && <Text type="secondary" className="!text-[11px] leading-snug">{precheckRuleText(policy)}</Text>}
    </>
  );
  const actions = (
    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2.5 mt-2" onClickCapture={() => setOpen(false)}>
      {/* 1. Primary Action by status */}
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
      {/* 2. Direct Danger action for in_progress */}
      {session.status === 'in_progress' && onAbort && (
        <Button size="small" danger icon={<PauseCircleOutlined />} onClick={() => onAbort(session)}>
          Dừng giữa chừng
        </Button>
      )}
      {/* 3. Completed / Evaluated */}
      {DONE_STATUSES.includes(session.status) && (
        <Button size="small" type={session.status === 'completed' ? 'primary' : 'default'} icon={<EditOutlined />} onClick={() => onEvaluate(session)}>
          {session.status === 'completed' ? 'Đánh giá' : 'Sửa đánh giá'}
        </Button>
      )}
      {/* 4. Missed reschedule */}
      {onSchedule && canReschedule && (
        <Button size="small" type="primary" icon={<ScheduleOutlined />} loading={scheduling} onClick={() => onSchedule(session)}>
          Xếp lại lịch
        </Button>
      )}
      {/* 5. Secondary: Change time */}
      {onSchedule && canChangeTime && (
        <Button size="small" icon={<ScheduleOutlined />} loading={scheduling} onClick={() => onSchedule(session)}>
          Đổi giờ
        </Button>
      )}
      {/* 6. Secondary: Cancel */}
      {onCancel && canChangeTime && (
        <Button size="small" danger icon={<StopOutlined />} onClick={() => onCancel(session)}>
          Hủy buổi
        </Button>
      )}
    </div>
  );
  const detail = <SessionDetail session={session} statusLabel={rescheduled ? 'Đã xếp lại lịch' : status.label} notes={notes} actions={actions} />;

  return (
    <Popover content={detail} trigger="click" placement="bottom" open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label={`${kind?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập'}, ${slotLabel(session.scheduledAt)} ${dayjs(session.scheduledAt).format('HH:mm')}, ${rescheduled ? 'Đã xếp lại lịch' : status.label}`}
        className={`w-full cursor-pointer rounded-lg border px-2 py-1.5 text-left transition-all hover:border-emerald-700 hover:shadow-xs ${
          session.status === 'cancelled'
            ? 'opacity-50 line-through bg-gray-50 border-gray-200'
            : session.status === 'blocked'
            ? 'bg-amber-50/60 border-amber-300'
            : session.status === 'ready'
            ? 'bg-cyan-50/50 border-cyan-300'
            : session.status === 'in_progress'
            ? 'bg-blue-50/60 border-blue-300'
            : 'bg-white border-gray-200/90'
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
            <span className="font-semibold text-xs text-gray-900 truncate">
              {kind?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập'}
            </span>
          </div>
          {met === true && <span className="font-semibold text-[11px] text-green-700 shrink-0">Đạt</span>}
          {met === false && <span className="font-semibold text-[11px] text-red-600 shrink-0">Chưa đạt</span>}
        </div>
        <div className="mt-1 flex items-center justify-between gap-1 text-[11px] text-gray-500">
          <span className="tabular-nums font-medium text-gray-600">
            {slotLabel(session.scheduledAt)} {dayjs(session.scheduledAt).format('HH:mm')}
          </span>
          {['missed', 'blocked', 'cancelled', 'in_progress'].includes(session.status) && (
            <span className={`text-[10px] font-medium truncate ${session.status === 'blocked' ? 'text-amber-700' : session.status === 'in_progress' ? 'text-blue-700' : 'text-gray-500'}`}>
              {rescheduled ? 'Đã xếp lại' : status.label}
            </span>
          )}
        </div>
      </button>
    </Popover>
  );
}

/**
 * A week of training: one row per horse, one column per day (Monday first). A row whose horse
 * follows an active plan can book its week from the plan's template.
 */
export default function WeekCalendar({ weekStart, onWeekChange, sessions = [], plans = [], onGenerate, generatingPlanId, onStart, onPreCheck, startingId, onEvaluate, onSchedule, onCancel, onEnd, onAbort, onRequestExam, schedulingId }) {
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

  return (
    <div>
      <div className="light-surface-box mb-3 flex flex-wrap items-center justify-between gap-2 bg-gray-50/80 p-2.5 rounded-xl border border-gray-200/80">
        <div className="flex items-center gap-1.5">
          <Button size="small" icon={<LeftOutlined />} aria-label="Tuần trước" onClick={() => onWeekChange(weekStart.subtract(7, 'day'))} />
          <Button size="small" icon={<RightOutlined />} aria-label="Tuần sau" onClick={() => onWeekChange(weekStart.add(7, 'day'))} />
          <Text strong className="px-2 text-sm text-gray-800 tabular-nums">
            {weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}
          </Text>
        </div>
        {!isThisWeek && (
          <Button size="small" type="link" className="!px-2 text-xs" onClick={() => onWeekChange(null)}>
            Về tuần này
          </Button>
        )}
      </div>

      {rows.size === 0 ? (
        <Empty description="Tuần này chưa có buổi tập nào." />
      ) : (
        <div className="light-surface-box overflow-x-auto rounded-xl border border-gray-200/80 bg-white shadow-xs">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200/80">
                <th className="w-[190px] px-3.5 py-2.5 text-left font-semibold text-gray-700 text-xs">
                  Ngựa
                </th>
                {days.map((d) => {
                  const today = d.date.isSame(dayjs(), 'day');
                  return (
                    <th
                      key={d.day}
                      className={`px-2 py-2.5 text-left font-semibold text-xs ${
                        today ? 'bg-emerald-50 text-emerald-950 font-bold' : 'text-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span>{d.short}</span>
                        <span className="tabular-nums font-normal text-gray-500">{d.date.format('DD/MM')}</span>
                        {today && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 inline-block shrink-0" />}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...rows.values()].map(({ horse, plan }) => {
                const locked = lockedIds.has(String(horse?._id));
                const raceInDays = plan?.targetRace && plan.targetRace.status !== 'withdrawn' ? plan.progress?.raceInDays : null;
                return (
                  <tr key={horse?._id} className="align-top hover:bg-gray-50/40 transition-colors">
                    <td className="px-3.5 py-3">
                      {/* The horse's own schedule on this page; its profile is linked from the filter tag. */}
                      <Link to={`?horse=${horse?._id}`} title="Xem lịch của riêng ngựa này" className="font-semibold text-emerald-950 hover:text-emerald-700">
                        {horse?.name}
                      </Link>
                      {plan ? (
                        <div className="mt-1 flex flex-col items-start gap-1">
                          <span className="text-xs text-gray-500 font-medium">
                            {PHASE_LABELS[plan.phase] || plan.phase}
                          </span>
                          {locked && (
                            <Tag color="red" className="!m-0">
                              Đang khóa tập
                            </Tag>
                          )}
                          {raceInDays != null && raceInDays >= 0 && (
                            <span className="text-[11px] font-medium leading-snug text-pink-700">
                              {raceInDays === 0 ? 'Hôm nay đua' : `Còn ${raceInDays} ngày`} tới {plan.targetRace.raceName} ({dayjs(plan.targetRace.raceDate).format('DD/MM')})
                            </span>
                          )}
                          <RaceFormTag form={plan.progress?.form} />
                          <Tooltip
                            title={
                              locked
                                ? 'Bác sĩ đang khóa tập: không xếp được buổi nào. Khi bác sĩ cho tập lại, lịch theo kế hoạch được xếp lại tự động.'
                                : 'Tuần này và tuần sau được xếp tự động theo lịch tuần mẫu. Bấm để xếp lại các buổi còn trống của tuần đang xem, kể cả buổi đã hủy.'
                            }
                          >
                            <Button
                              size="small"
                              icon={<ScheduleOutlined />}
                              loading={generatingPlanId === plan._id}
                              disabled={locked}
                              onClick={() => onGenerate(plan, weekStart)}
                              className="text-xs"
                            >
                              Xếp lại tuần
                            </Button>
                          </Tooltip>
                        </div>
                      ) : (
                        <Text type="secondary" className="block !text-xs mt-0.5">
                          Không có kế hoạch
                        </Text>
                      )}
                    </td>
                    {days.map((d) => {
                      const cell = inWeek.filter((s) => String(s.horse?._id) === String(horse?._id) && dayjs(s.scheduledAt).isSame(d.date, 'day'));
                      // A session called off and booked again in the same slot ("Xếp lại tuần", or after the
                      // vet's all-clear) shows once: the new one. The old one stays in the list view.
                      const live = cell.filter((s) => s.status !== 'cancelled');
                      const list = cell.filter((s) => s.status !== 'cancelled' || !live.some((l) => slotOf(l.scheduledAt) === slotOf(s.scheduledAt)));
                      const replaced = cell.filter((s) => !list.includes(s));
                      const { entries, race } = plan && !d.date.isBefore(dayjs(), 'day') ? plannedFor(plan, d.date) : { entries: [] };
                      const due = entries.filter((e) => e.at.isAfter(dayjs()) && !cell.some((s) => slotOf(s.scheduledAt) === e.slot));
                      const planned = locked ? [] : due;
                      const today = d.date.isSame(dayjs(), 'day');
                      return (
                        <td key={d.day} className={`px-1.5 py-2.5 ${today ? 'bg-emerald-50/20' : ''}`}>
                          <div className="flex flex-col gap-1.5">
                            {list.map((s) => (
                              <SessionChip
                                key={s._id}
                                session={s}
                                onStart={onStart}
                                onPreCheck={onPreCheck}
                                onEvaluate={onEvaluate}
                                onSchedule={onSchedule}
                                onCancel={onCancel}
                                onEnd={onEnd}
                                onAbort={onAbort}
                                onRequestExam={onRequestExam}
                                starting={startingId === s._id}
                                scheduling={schedulingId === s._id}
                              />
                            ))}
                            {race && (
                              <span className="flex items-center gap-1 rounded-lg border border-pink-200 bg-pink-50 px-2 py-1 text-[11px] font-semibold text-pink-700">
                                <FlagOutlined /> Ngày đua
                              </span>
                            )}
                            {planned.map((e) => (
                              <PlannedChip key={e.slot} entry={e} />
                            ))}
                            {locked && due.length > 0 && !live.length && (
                              <span className="text-[11px] font-medium text-red-600 block py-1 pl-1">
                                Khóa tập
                              </span>
                            )}
                            {replaced.length > 0 && (
                              <Tooltip title={replaced.map((s) => s.cancelReason).filter(Boolean).join(' · ') || 'Buổi đã hủy'}>
                                <span className="text-[10px] text-gray-500 pl-1">Đã thay {replaced.length} buổi hủy</span>
                              </Tooltip>
                            )}
                            {!list.length && !planned.length && !race && !(locked && due.length) && (
                              <span className="text-[11px] font-medium text-slate-600 block py-1 pl-1">
                                Nghỉ
                              </span>
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
    </div>
  );
}
