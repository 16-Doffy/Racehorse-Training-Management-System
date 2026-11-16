import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Dropdown, Select, Tag } from 'antd';
import { CalendarOutlined, EditOutlined, FlagOutlined, MoreOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PlanTimeline from './PlanTimeline';
import { WeekTimetable } from './weekTemplate';
import { RaceFormBlock, RaceFormDot } from './RaceForm';
import { PhaseCheckBlock, PlanJournal, PlanPauseNotice } from './PhaseCheckpoint';
import { PHASE_LABELS, PLAN_STATUS_COLORS, PLAN_STATUS_LABELS, SESSION_KINDS, SURFACE_LABELS, sessionTimeLabel } from './trainingVocab';

/** "Tuần 10/15 · Tốc độ, tuần 2/3", or when the cycle hasn't started / is over. */
export function whereNow(plan) {
  const p = plan.progress;
  if (!p) return null;
  if (!p.started) return `Bắt đầu ngày ${dayjs(plan.startDate).format('DD/MM/YYYY')}`;
  if (p.ended) return `Đã qua hết ${p.totalWeeks} tuần của kế hoạch`;
  const phase = plan.phases?.[p.phaseIndex];
  // A phase made longer (an illness, a week more after its checkpoint) or shorter to keep the race.
  const extra = phase?.extraDays ? ` (${phase.extraDays > 0 ? '+' : ''}${phase.extraDays} ngày)` : '';
  return `Tuần ${p.week}/${p.totalWeeks} · ${PHASE_LABELS[plan.phase]}${phase ? `, tuần ${p.phaseWeek}/${p.phaseWeeks || phase.weeks}${extra}` : ''}`;
}

/** "Cúp Mùa Đông · 20/11 · còn 4 ngày", or null without a race. */
export function raceLine(plan) {
  const race = plan.targetRace && plan.targetRace.status !== 'withdrawn' ? plan.targetRace : null;
  if (!race) return null;
  const days = plan.progress?.raceInDays;
  return `${race.raceName} · ${dayjs(race.raceDate).format('DD/MM')}${days > 0 ? ` · còn ${days} ngày` : days === 0 ? ' · hôm nay' : ''}`;
}

/**
 * One plan in full, on the right of the plan list: who and for which race, the route of phases with
 * today on it, the week template of the current phase (or another, picked) as a timetable, the race
 * readiness and the next sessions. Its buttons lead on: the sessions (Lịch tập), the week template
 * (Sửa tuần mẫu), and the rare ones behind "⋯" (book a week again, end or drop the plan).
 */
export default function PlanFocusPanel({ plan, locked = false, onEditWeek, menuItems = [], onMenu, busy = false }) {
  const navigate = useNavigate();
  const phases = plan.phases || [];
  const progress = plan.progress || {};
  const current = progress.started && !progress.ended ? progress.phaseIndex : 0;
  const [picked, setPicked] = useState(null);
  const shown = picked != null && phases[picked] ? picked : current;
  const phase = phases[shown];
  const race = raceLine(plan);
  const upcoming = progress.upcoming || [];

  return (
    <section className="light-surface-box min-w-0 rounded-xl border border-gray-200 bg-white" aria-label={`Kế hoạch của ${plan.horse?.name || 'ngựa'}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <RaceFormDot form={progress.form} />
            <Link to={`/horses/${plan.horse?._id}`} className="text-lg font-semibold text-gray-900 hover:underline">
              {plan.horse?.name || 'Ngựa'}
            </Link>
            <Tag color={PLAN_STATUS_COLORS[plan.status]} className="!m-0">
              {PLAN_STATUS_LABELS[plan.status]}
            </Tag>
            {locked && (
              <Tag color="red" className="!m-0">
                Đang khóa tập
              </Tag>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-gray-600">
            {race ? (
              <span className="text-pink-700">
                <FlagOutlined className="mr-1" />
                {race}
              </span>
            ) : (
              <span>Không nhắm giải cụ thể</span>
            )}
            <span className="tabular-nums text-gray-500">
              {plan.distanceTarget} m · {SURFACE_LABELS[plan.surface] || plan.surface} · Sáng {plan.sessionTime || '07:30'}, chiều {plan.afternoonTime || '16:00'}
            </span>
          </div>
          {plan.goal && <div className="mt-0.5 text-xs text-gray-500">{plan.goal}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="primary" icon={<CalendarOutlined />} onClick={() => navigate(`/training/sessions?plan=${plan._id}`)}>
            Lịch tập
          </Button>
          <Button icon={<EditOutlined />} onClick={() => onEditWeek?.(shown)}>
            Sửa tuần mẫu
          </Button>
          {menuItems.length > 0 && (
            <Dropdown trigger={['click']} menu={{ items: menuItems, onClick: ({ key }) => onMenu?.(key) }}>
              <Button icon={<MoreOutlined />} loading={busy} aria-label="Thao tác khác" />
            </Dropdown>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4">
        <PlanPauseNotice plan={plan} />
        <div>
          <PlanTimeline phases={phases} raceDate={plan.targetRace?.status === 'withdrawn' ? null : plan.targetRace?.raceDate} />
          <div className="mt-1 text-xs text-gray-600">{whereNow(plan)}</div>
          <PlanJournal plan={plan} />
        </div>

        <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 rounded-lg border border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-sm font-medium text-gray-900">
                Tuần mẫu
                {phase?.startDate && (
                  <span className="ml-2 font-normal tabular-nums text-gray-500">
                    {dayjs(phase.startDate).format('DD/MM')} – {dayjs(phase.endDate).format('DD/MM')}
                  </span>
                )}
              </span>
              {phases.length > 1 && (
                <Select
                  size="small"
                  className="!w-52"
                  value={shown}
                  onChange={setPicked}
                  options={phases.map((p, i) => ({ value: i, label: `${i + 1}. ${PHASE_LABELS[p.key] || p.key}${i === current && progress.started && !progress.ended ? ' (hiện tại)' : ''}` }))}
                  aria-label="Xem tuần mẫu của giai đoạn"
                />
              )}
            </div>
            {phase?.week?.length ? (
              <WeekTimetable phase={phase} sessionTime={plan.sessionTime} afternoonTime={plan.afternoonTime} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-4 text-sm text-gray-600">
                <span>Giai đoạn này chưa có tuần mẫu nên chưa tự xếp được buổi tập nào.</span>
                <Button size="small" type="primary" onClick={() => onEditWeek?.(shown)}>
                  Thiết lập tuần mẫu
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-1">
            {progress.checkpoint && (
              <div className="rounded-lg border border-gray-200 px-3 py-2.5">
                <PhaseCheckBlock plan={plan} />
              </div>
            )}
            {progress.form && (
              <div className="rounded-lg border border-gray-200 px-3 py-2.5">
                <RaceFormBlock form={progress.form} />
              </div>
            )}
            <div className="rounded-lg border border-gray-200 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-900">Buổi sắp tới</span>
                <Link to={`/training/sessions?plan=${plan._id}`} className="text-xs">
                  Xem lịch tập →
                </Link>
              </div>
              {upcoming.length ? (
                <div className="flex flex-col gap-1">
                  {upcoming.slice(0, 4).map((s) => (
                    <div key={s._id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-gray-900">{SESSION_KINDS[s.kind]?.label || 'Buổi tập'}</span>
                      <span className="shrink-0 tabular-nums text-gray-500">{sessionTimeLabel(s.scheduledAt)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500">{locked ? 'Bác sĩ đang khóa tập: chưa xếp buổi nào.' : 'Chưa có buổi nào trong 2 tuần tới.'}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
