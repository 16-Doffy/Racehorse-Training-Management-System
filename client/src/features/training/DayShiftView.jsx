import { useState } from 'react';
import { Button, DatePicker, Dropdown, Empty, Input, Tag, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  LeftOutlined,
  MoreOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  StarFilled,
  StopOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { fold } from '../../utils/fold';
import { DONE_STATUSES, PHASE_LABELS, SESSION_KINDS, sessionWindowLabel } from './trainingVocab';
import { SESSION_STATUS_COLORS, SESSION_STATUS_LABELS } from './sessionStatus';
import { RaceFormTag } from './RaceForm';
import { useClubPolicy } from './useClubPolicy';
import { useLockedHorseIds } from './useLockedHorses';

const SHIFTS = [
  {
    key: 'morning',
    label: 'Ca Sáng',
    windowHint: 'Trước 11:30 · Tập chính / tốc độ',
    emptyHint: 'Không có buổi tập ca sáng.',
  },
  {
    key: 'midday',
    label: 'Ca Trưa',
    windowHint: '11:30 – 13:59 · Nghỉ tiêu hóa',
    emptyHint: 'Nghỉ trưa & tiêu hóa (chỉ tập khi có lịch đặc biệt).',
  },
  {
    key: 'afternoon',
    label: 'Ca Chiều',
    windowHint: 'Từ 14:00 · Tập nhẹ / hồi phục',
    emptyHint: 'Không có buổi ca chiều (quy định CLB: chiều chỉ tập nhẹ).',
  },
];

function shiftOf(dateLike) {
  const h = dayjs(dateLike).hour();
  const m = dayjs(dateLike).minute();
  const totalMin = h * 60 + m;
  if (totalMin < 11 * 60 + 30) return 'morning';
  if (totalMin < 14 * 60) return 'midday';
  return 'afternoon';
}

function summarizeHorseDay(sessions = []) {
  const nonCancelled = sessions.filter((s) => s.status !== 'cancelled');
  const ranOrDone = nonCancelled.filter((s) => DONE_STATUSES.includes(s.status) || s.status === 'aborted');
  const totalSegments = nonCancelled.reduce((sum, s) => sum + (Array.isArray(s.segments) && s.segments.length ? s.segments.length : 1), 0);
  const totalDistanceM = ranOrDone.reduce((sum, s) => sum + (Number(s.metrics?.distance) || 0), 0);
  const judged = nonCancelled.filter((s) => DONE_STATUSES.includes(s.status) && s.outcome?.met != null);
  const metCount = judged.filter((s) => s.outcome.met === true).length;
  const ratings = nonCancelled.map((s) => Number(s.performanceRating)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 10);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
  return { sessionCount: nonCancelled.length, totalSegments, totalDistanceM, judgedCount: judged.length, metCount, avgRating };
}

function DaySessionCard({
  session,
  onStart,
  onPreCheck,
  onEvaluate,
  onSchedule,
  onCancel,
  onEnd,
  onAbort,
  onReplay,
  starting,
}) {
  const policy = useClubPolicy();
  const segments = Array.isArray(session.segments) ? session.segments.filter((s) => s?.kind) : [];
  const segResults = session.outcome?.segmentResults || [];
  const kind = SESSION_KINDS[session.kind];
  const finished = DONE_STATUSES.includes(session.status) || session.status === 'aborted';
  const canChangeTime = ['scheduled', 'ready', 'blocked'].includes(session.status);

  const moreItems = [];
  if (canChangeTime) {
    moreItems.push({ key: 'reschedule', label: 'Đổi giờ' });
    moreItems.push({ key: 'cancel', label: 'Hủy buổi tập', danger: true });
  }
  if (session.status === 'missed' && !session.rescheduledTo) {
    moreItems.push({ key: 'reschedule', label: 'Xếp lại giờ mới' });
  }

  const handleMore = ({ key }) => {
    if (key === 'reschedule') onSchedule?.(session);
    if (key === 'cancel') onCancel?.(session);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2.5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-bold text-gray-900">{kind?.label || 'Buổi tập'}</span>
            {segments.length > 1 && (
              <Tag color="gold" className="!m-0 !text-[10px]">
                {segments.length} bài ghép
              </Tag>
            )}
            <Tag color={SESSION_STATUS_COLORS[session.status]} className="!m-0 !text-[10px]">
              {SESSION_STATUS_LABELS[session.status] || session.status}
            </Tag>
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-gray-500">
            Lịch {sessionWindowLabel(session)}
            {session.actualStartAt ? ` · Chạy lúc ${dayjs(session.actualStartAt).format('HH:mm')}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(session.status === 'scheduled' || session.status === 'blocked') && (
            <Tooltip title={`Cửa kiểm tra: ${policy.precheckOpensBeforeMin}' trước đến ${policy.precheckClosesAfterMin}' sau giờ tập`}>
              <Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => onPreCheck?.(session)}>
                Kiểm tra
              </Button>
            </Tooltip>
          )}
          {session.status === 'ready' && (
            <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={starting} onClick={() => onStart?.(session)}>
              Bắt đầu
            </Button>
          )}
          {session.status === 'in_progress' && (
            <>
              <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => onEnd?.(session)}>
                Kết thúc
              </Button>
              <Button size="small" danger icon={<PauseCircleOutlined />} onClick={() => onAbort?.(session)}>
                Dừng
              </Button>
            </>
          )}
          {session.status === 'completed' && (
            <Button size="small" type="primary" onClick={() => onEvaluate?.(session)}>
              Đánh giá
            </Button>
          )}
          {session.status === 'evaluated' && (
            <Button size="small" onClick={() => onEvaluate?.(session)}>
              Sửa đánh giá
            </Button>
          )}
          {finished && session.metrics?.sampleCount > 0 && (
            <Button size="small" type="text" onClick={() => onReplay?.(session)}>
              Xem lại
            </Button>
          )}
          {moreItems.length > 0 && (
            <Dropdown menu={{ items: moreItems, onClick: handleMore }} trigger={['click']}>
              <Button size="small" type="text" icon={<MoreOutlined />} aria-label="Thao tác thêm" />
            </Dropdown>
          )}
        </div>
      </div>

      {/* Multi-segment workout chain */}
      {segments.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1 rounded-md border border-amber-200/70 bg-amber-50/40 p-2 text-xs">
          {segments.map((seg, idx) => {
            const sr = segResults[idx];
            return (
              <div key={`${seg.kind}-${idx}`} className="flex flex-wrap items-center justify-between gap-1.5 border-b border-amber-200/40 pb-1 last:border-b-0 last:pb-0">
                <span className="font-medium text-gray-900">
                  <span className="mr-1 text-amber-700">#{idx + 1}</span>
                  {SESSION_KINDS[seg.kind]?.short || seg.kind}
                  {seg.note ? <span className="font-normal text-gray-600"> · {seg.note}</span> : null}
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums text-gray-600">
                  <span>{[seg.durationMinutes ? `${seg.durationMinutes}'` : null, seg.distanceM ? `${Number(seg.distanceM).toLocaleString('vi-VN')}m` : null].filter(Boolean).join(' · ')}</span>
                  {sr?.kind !== 'walk' && sr?.actualMaxSpeedKmh != null && <span>{sr.actualMaxSpeedKmh} km/h</span>}
                  {sr?.actualAvgHeartRate != null && <span>{Math.round(sr.actualAvgHeartRate)} bpm</span>}
                  {sr?.recoveryDropBpm > 0 && <span className="font-medium text-emerald-700">hạ -{sr.recoveryDropBpm} bpm</span>}
                  {sr?.met === true && <span className="rounded bg-emerald-100 px-1 py-px text-[10px] font-semibold text-emerald-700">Đạt</span>}
                  {sr?.met === false && <span className="rounded bg-rose-100 px-1 py-px text-[10px] font-semibold text-rose-700">Chưa đạt</span>}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-1.5 text-[11px] tabular-nums text-gray-600">
          Mục tiêu:{' '}
          {[
            session.prescription?.distanceM ? `${session.prescription.distanceM.toLocaleString('vi-VN')} m` : null,
            session.prescription?.targetSpeedKmh ? `${session.prescription.targetSpeedKmh} km/h` : null,
            session.prescription?.targetHeartRateMax ? `tim ≤ ${session.prescription.targetHeartRateMax} bpm` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Theo tình trạng thực tế'}
        </div>
      )}

      {/* Overall result & rating */}
      {(finished || session.outcome?.met != null || session.performanceRating != null) && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-1.5 text-[11px]">
          <span className={session.outcome?.met === true ? 'font-semibold text-emerald-700' : session.outcome?.met === false ? 'font-semibold text-rose-600' : 'text-gray-600'}>
            {session.outcome?.summary || (session.status === 'aborted' ? `Dừng: ${session.abortReason || 'giữa chừng'}` : 'Hoàn thành')}
          </span>
          {session.performanceRating != null && (
            <span className="shrink-0 font-semibold text-gray-800">
              <StarFilled style={{ color: '#eab308' }} /> {session.performanceRating}/10
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Daily 3-shift schedule & performance view: inspects every horse's Morning / Midday / Afternoon
 * sessions on a single day, breaking down chained exercises (`segments`) and daily form totals.
 */
export default function DayShiftView({
  sessions = [],
  plans = [],
  selectedDate,
  onDateChange,
  toolbar,
  onStart,
  onPreCheck,
  onEvaluate,
  onSchedule,
  onCancel,
  onEnd,
  onAbort,
  onReplay,
  startingId,
}) {
  const [search, setSearch] = useState('');
  const lockedIds = useLockedHorseIds();
  const activePlanByHorse = new Map(plans.filter((p) => p.status === 'active').map((p) => [String(p.horse?._id), p]));

  const onDay = sessions
    .filter((s) => dayjs(s.scheduledAt).isSame(selectedDate, 'day') && s.status !== 'cancelled')
    .sort((a, b) => dayjs(a.scheduledAt).valueOf() - dayjs(b.scheduledAt).valueOf());

  const byHorse = new Map();
  for (const s of onDay) {
    const hId = String(s.horse?._id);
    if (!byHorse.has(hId)) byHorse.set(hId, { horse: s.horse, plan: activePlanByHorse.get(hId), sessions: [] });
    byHorse.get(hId).sessions.push(s);
  }
  for (const [hId, plan] of activePlanByHorse.entries()) {
    if (!byHorse.has(hId)) byHorse.set(hId, { horse: plan.horse, plan, sessions: [] });
  }

  const horseRows = [...byHorse.values()]
    .filter(({ horse }) => !search.trim() || fold(horse?.name).includes(fold(search.trim())))
    .sort((a, b) => (b.sessions.length > 0) - (a.sessions.length > 0) || (a.horse?.name || '').localeCompare(b.horse?.name || '', 'vi'));

  const isToday = selectedDate.isSame(dayjs(), 'day');

  return (
    <div className="st-workbench-frame">
      <div className="st-toolbar justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {toolbar}
          <Input
            allowClear
            prefix={<SearchOutlined className="text-gray-400" />}
            placeholder="Tìm ngựa"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="!w-44"
            aria-label="Tìm ngựa trong ngày"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="small" icon={<LeftOutlined />} aria-label="Ngày trước" onClick={() => onDateChange(selectedDate.subtract(1, 'day'))} />
          <DatePicker
            size="small"
            allowClear={false}
            value={selectedDate}
            format="DD/MM/YYYY"
            onChange={(d) => d && onDateChange(d)}
            className="!w-[130px]"
          />
          <Button size="small" icon={<RightOutlined />} aria-label="Ngày sau" onClick={() => onDateChange(selectedDate.add(1, 'day'))} />
          {!isToday && (
            <Button size="small" type="link" className="!px-1 text-xs" onClick={() => onDateChange(dayjs())}>
              Về hôm nay
            </Button>
          )}
          <span className="pl-1 text-xs font-semibold tabular-nums text-gray-500">
            {onDay.length} buổi ngày {selectedDate.format('DD/MM')}
          </span>
        </div>
      </div>

      {horseRows.length === 0 ? (
        <div className="py-10">
          <Empty description={`Không có lịch tập hoặc kế hoạch nào khớp "${search || selectedDate.format('DD/MM/YYYY')}".`} />
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          {horseRows.map(({ horse, plan, sessions: list }) => {
            const hId = String(horse?._id);
            const locked = lockedIds.has(hId);
            const summary = summarizeHorseDay(list);
            const byShift = {
              morning: list.filter((s) => shiftOf(s.scheduledAt) === 'morning'),
              midday: list.filter((s) => shiftOf(s.scheduledAt) === 'midday'),
              afternoon: list.filter((s) => shiftOf(s.scheduledAt) === 'afternoon'),
            };

            return (
              <section key={hId} className="light-surface-box rounded-xl border border-gray-200 bg-white p-3 shadow-xs">
                <header className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/horses/${hId}`} className="text-[15px] font-bold text-gray-900 hover:text-amber-700">
                      {horse?.name}
                    </Link>
                    {plan && (
                      <Tag className="!m-0 !text-[11px]">{PHASE_LABELS[plan.phase] || plan.phase}</Tag>
                    )}
                    {plan?.progress?.form && <RaceFormTag form={plan.progress.form} />}
                    {locked && <Tag color="error" className="!m-0 !text-[11px]">Bác sĩ khóa tập</Tag>}
                  </div>

                  {/* Daily form summary across all 3 shifts */}
                  <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums text-gray-600">
                    <span>
                      Trong ngày: <strong className="text-gray-900">{summary.sessionCount} ca</strong> ({summary.totalSegments} bài)
                    </span>
                    {summary.totalDistanceM > 0 && (
                      <span>
                        Cự ly: <strong className="text-gray-900">{summary.totalDistanceM.toLocaleString('vi-VN')} m</strong>
                      </span>
                    )}
                    {summary.judgedCount > 0 && (
                      <span className={summary.metCount === summary.judgedCount ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
                        Đạt {summary.metCount}/{summary.judgedCount} ca
                      </span>
                    )}
                    {summary.avgRating && (
                      <span className="font-semibold text-gray-900">
                        <StarFilled style={{ color: '#eab308' }} /> ĐTB ngày {summary.avgRating}/10
                      </span>
                    )}
                  </div>
                </header>

                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
                  {SHIFTS.map((shift) => {
                    const items = byShift[shift.key];
                    return (
                      <div key={shift.key} className="flex flex-col gap-2 rounded-lg border border-gray-200/80 bg-[#F8FAFC] p-2.5">
                        <div className="flex items-center justify-between gap-2 border-b border-gray-200/70 pb-1.5">
                          <span className="text-xs font-bold text-gray-800">{shift.label}</span>
                          <span className="text-[11px] text-gray-500">{shift.windowHint}</span>
                        </div>
                        {items.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {items.map((s) => (
                              <DaySessionCard
                                key={s._id}
                                session={s}
                                onStart={onStart}
                                onPreCheck={onPreCheck}
                                onEvaluate={onEvaluate}
                                onSchedule={onSchedule}
                                onCancel={onCancel}
                                onEnd={onEnd}
                                onAbort={onAbort}
                                onReplay={onReplay}
                                starting={startingId === s._id}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-1 items-center py-2 text-xs text-gray-400">
                            <StopOutlined className="mr-1.5 opacity-60" />
                            <span>{shift.emptyHint}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
