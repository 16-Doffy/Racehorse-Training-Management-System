import { Button, Popover, Tag, Typography, Tooltip, Empty } from 'antd';
import { LeftOutlined, RightOutlined, PlayCircleOutlined, EditOutlined, ScheduleOutlined, SafetyCertificateOutlined, StopOutlined, CheckCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { SESSION_KINDS, OBJECTIVE_LABELS, WEEK_DAYS, PHASE_LABELS, mondayOf, actualTimeLabel, ABORT_CATEGORY_LABELS, DONE_STATUSES } from './trainingVocab';
import { SESSION_STATUS_LABELS } from './sessionStatus';

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

/** "800m · 58 km/h · nhịp tim ≤ 215" */
function workout(p) {
  if (!p) return '';
  const parts = [];
  if (p.distanceM) parts.push(p.reps > 1 ? `${p.reps} × ${p.distanceM}m` : `${p.distanceM}m`);
  if (p.restMinutes) parts.push(`nghỉ ${p.restMinutes}'`);
  if (p.targetSpeedKmh) parts.push(`${p.targetSpeedKmh} km/h`);
  if (p.targetHeartRateMax) parts.push(`nhịp tim ≤ ${p.targetHeartRateMax}`);
  return parts.join(' · ');
}

const slotLabel = (scheduledAt) => (dayjs(scheduledAt).hour() < 12 ? 'Sáng' : 'Chiều');

function SessionChip({ session, onStart, onPreCheck, onEvaluate, onSchedule, onCancel, onEnd, onAbort, starting, scheduling }) {
  const kind = SESSION_KINDS[session.kind];
  const status = statusMeta(session.status);
  const met = session.outcome?.met;
  const canChangeTime = ['scheduled', 'ready', 'blocked'].includes(session.status);
  const canReschedule = session.status === 'missed' && !session.rescheduledTo;
  const rescheduled = session.status === 'missed' && Boolean(session.rescheduledTo);
  const detail = (
    <div className="flex w-[min(300px,calc(100vw-48px))] flex-col gap-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-1">
        <Tag color={kind?.color || 'default'} className="!m-0">
          {kind?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập'}
        </Tag>
        <Text type="secondary" className="!text-xs">
          Dự kiến {dayjs(session.scheduledAt).format('DD/MM')} · {slotLabel(session.scheduledAt)} {dayjs(session.scheduledAt).format('HH:mm')}
        </Text>
      </div>
      {actualTimeLabel(session) && <div className="text-xs">Thực tế {actualTimeLabel(session)}</div>}
      {workout(session.prescription) && <div>{workout(session.prescription)}</div>}
      {session.coachNote && <Text type="secondary" className="!text-xs">{session.coachNote}</Text>}
      <div className="flex items-center gap-1.5 text-xs">
        <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} />
        {rescheduled ? 'Đã lỡ giờ · đã xếp lại lịch' : status.label}
        {session.status === 'in_progress' && session.metrics?.distance ? ` · đã chạy ${session.metrics.distance}m` : ''}
      </div>
      {session.status === 'missed' && (
        <Text type="secondary" className="!text-xs">
          {session.missedReason || 'Không kiểm tra sẵn sàng hoặc bắt đầu trong thời hạn của buổi tập.'}
          {rescheduled && ' Buổi cũ được giữ lại trong lịch sử; buổi mới đã có trong lịch.'}
        </Text>
      )}
      {session.status === 'cancelled' && session.cancelReason && (
        <Text type="secondary" className="!text-xs">Lý do hủy: {session.cancelReason}</Text>
      )}
      {session.status === 'aborted' && (
        <Text type="warning" className="!text-xs">
          Dừng giữa chừng — {ABORT_CATEGORY_LABELS[session.abortCategory] || 'lý do khác'}{session.abortReason ? `: ${session.abortReason}` : ''}
        </Text>
      )}
      {session.status === 'blocked' && session.blockedReason && (
        <Text type="warning" className="!text-xs">{session.blockedReason}</Text>
      )}
      {canChangeTime && (
        <Text type="secondary" className="!text-xs">
          Kiểm tra sẵn sàng từ 60 phút trước đến 30 phút sau giờ tập. Kết quả kiểm tra có hiệu lực 2 giờ.
        </Text>
      )}
      {session.outcome?.summary && <div className="text-xs">{session.outcome.summary}</div>}
      <div className="mt-1 flex flex-wrap gap-2">
        {['scheduled', 'blocked'].includes(session.status) && (
          <Button size="small" type="primary" icon={<SafetyCertificateOutlined />} onClick={() => onPreCheck(session)}>
            {session.status === 'blocked' ? 'Kiểm tra lại' : 'Kiểm tra sẵn sàng'}
          </Button>
        )}
        {session.status === 'ready' && (
          <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={starting} onClick={() => onStart(session)}>
            Bắt đầu
          </Button>
        )}
        {onSchedule && (canChangeTime || canReschedule) && (
          <Button size="small" icon={<ScheduleOutlined />} loading={scheduling} onClick={() => onSchedule(session)}>
            {canReschedule ? 'Xếp lại lịch' : 'Đổi giờ'}
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
        {onCancel && canChangeTime && (
          <Button size="small" danger icon={<StopOutlined />} onClick={() => onCancel(session)}>
            Hủy buổi
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Popover content={detail} trigger="click" placement="bottom">
      <button
        type="button"
        aria-label={`${kind?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập'}, ${slotLabel(session.scheduledAt)} ${dayjs(session.scheduledAt).format('HH:mm')}, ${rescheduled ? 'Đã xếp lại lịch' : status.label}`}
        className={`w-full cursor-pointer rounded-md border px-1.5 py-1 text-left transition-shadow hover:shadow-sm ${
          session.status === 'cancelled' ? 'opacity-50 line-through' : ''
        }`}
        style={{ borderColor: 'rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)' }}
      >
        <div className="flex items-start gap-1">
          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
          <Tag color={kind?.color || 'default'} className="!m-0 !whitespace-normal !px-1 !text-[11px] !leading-4">
            {kind?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập'}
          </Tag>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-1 text-[11px] text-gray-500">
          <span className="tabular-nums">{slotLabel(session.scheduledAt)} {dayjs(session.scheduledAt).format('HH:mm')}</span>
          {met === true && <span className="font-medium text-green-700">Đạt</span>}
          {met === false && <span className="font-medium text-red-700">Chưa đạt</span>}
        </div>
        {['missed', 'blocked', 'cancelled'].includes(session.status) && (
          <div className={`mt-0.5 text-[11px] ${session.status === 'blocked' ? 'text-amber-700' : 'text-gray-500'}`}>
            {rescheduled ? 'Đã xếp lại lịch' : status.label}
          </div>
        )}
      </button>
    </Popover>
  );
}

/**
 * A week of training: one row per horse, one column per day (Monday first). A row whose horse
 * follows an active plan can book its week from the plan's template.
 */
export default function WeekCalendar({ weekStart, onWeekChange, sessions = [], plans = [], onGenerate, generatingPlanId, onStart, onPreCheck, startingId, onEvaluate, onSchedule, onCancel, onEnd, onAbort, schedulingId }) {
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

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button icon={<LeftOutlined />} aria-label="Tuần trước" onClick={() => onWeekChange(weekStart.subtract(7, 'day'))} />
        <Text strong className="min-w-[180px] text-center tabular-nums">
          {weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}
        </Text>
        <Button icon={<RightOutlined />} aria-label="Tuần sau" onClick={() => onWeekChange(weekStart.add(7, 'day'))} />
        {!isThisWeek && (
          <Button type="link" onClick={() => onWeekChange(null)}>
            Về tuần này
          </Button>
        )}
      </div>

      {rows.size === 0 ? (
        <Empty description="Tuần này chưa có buổi tập nào." />
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-[190px] px-3 py-2 text-left font-medium text-gray-500">Ngựa</th>
                {days.map((d) => (
                  <th
                    key={d.day}
                    className={`px-1.5 py-2 text-left font-medium ${d.date.isSame(dayjs(), 'day') ? 'text-gray-900' : 'text-gray-500'}`}
                  >
                    {d.short} <span className="tabular-nums font-normal">{d.date.format('DD/MM')}</span>
                    {d.date.isSame(dayjs(), 'day') && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-gray-900 align-middle" />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows.values()].map(({ horse, plan }) => (
                <tr key={horse?._id} className="border-t align-top" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                  <td className="px-3 py-2">
                    <Link to={`/horses/${horse?._id}`} className="font-medium">
                      {horse?.name}
                    </Link>
                    {plan ? (
                      <div className="mt-0.5 flex flex-col items-start gap-1">
                        <Text type="secondary" className="!text-xs">
                          {PHASE_LABELS[plan.phase]}
                        </Text>
                        <Tooltip title="Xếp buổi tập tuần này theo lịch tuần mẫu của giai đoạn">
                          <Button
                            size="small"
                            icon={<ScheduleOutlined />}
                            loading={generatingPlanId === plan._id}
                            onClick={() => onGenerate(plan, weekStart)}
                          >
                            Sinh lịch tuần
                          </Button>
                        </Tooltip>
                      </div>
                    ) : (
                      <Text type="secondary" className="block !text-xs">
                        Không có kế hoạch đang chạy
                      </Text>
                    )}
                  </td>
                  {days.map((d) => {
                    const list = inWeek.filter((s) => String(s.horse?._id) === String(horse?._id) && dayjs(s.scheduledAt).isSame(d.date, 'day'));
                    return (
                      <td key={d.day} className={`px-1.5 py-2 ${d.date.isSame(dayjs(), 'day') ? 'bg-black/[0.025]' : ''}`}>
                        <div className="flex flex-col gap-1">
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
                              starting={startingId === s._id}
                              scheduling={schedulingId === s._id}
                            />
                          ))}
                          {!list.length && <span className="text-[11px] text-gray-400">Nghỉ</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
