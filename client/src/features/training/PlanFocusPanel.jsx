import { Link } from 'react-router-dom';
import { Tag } from 'antd';
import dayjs from 'dayjs';
import { PHASE_LABELS, PHASE_DESCRIPTIONS, SESSION_KINDS, WEEK_DAYS, PLAN_STATUS_LABELS, PLAN_STATUS_COLORS } from './trainingVocab';

/** A readable view of one selected plan; all dates and prescriptions come from the API. */
export default function PlanFocusPanel({ plan }) {
  const phases = plan.phases || [];
  const progress = plan.progress;
  const currentIndex = progress?.started && !progress.ended ? progress.phaseIndex : -1;
  const phase = phases[currentIndex] || phases.find(p => p.key === plan.phase) || phases[0];
  return (
    <section className="st-plan-focus light-surface-box" aria-label="Lộ trình kế hoạch đang xem">
      <header className="st-plan-focus-header">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Tag color={PLAN_STATUS_COLORS[plan.status]} className="!m-0">{PLAN_STATUS_LABELS[plan.status]}</Tag>
            <span className="text-xs tabular-nums" style={{ color: 'var(--st-ink-secondary)' }}>
              {dayjs(plan.startDate).format('DD/MM/YYYY')}{plan.endDate ? ` – ${dayjs(plan.endDate).format('DD/MM/YYYY')}` : ''}
            </span>
          </div>
          <h2 className="!m-0 !text-lg !font-semibold" style={{ color: 'var(--st-ink)' }}>{plan.horse?.name || 'Ngựa'}{plan.targetRace?.raceName ? ` hướng tới ${plan.targetRace.raceName}` : ''}</h2>
          {plan.goal && <p className="m-0 mt-1 text-sm" style={{ color: 'var(--st-ink-secondary)' }}>{plan.goal}</p>}
        </div>
        <Link className="st-focus-action" to={`/training/sessions?plan=${plan._id}`}>Mở lịch tập</Link>
      </header>
      {phases.length ? <ol className="st-phase-grid" aria-label="Các giai đoạn của kế hoạch">
        {phases.map((p, i) => {
          const current = i === currentIndex;
          const past = Boolean(progress?.ended || (currentIndex >= 0 && i < currentIndex));
          return <li key={`${p.key}-${i}`} className={`st-phase-card${current ? ' is-current' : ''}`} aria-current={current ? 'step' : undefined}>
            <span className="st-phase-state">{current ? `Đang ở tuần ${progress.phaseWeek}/${p.weeks}` : past ? 'Đã qua giai đoạn' : 'Theo lộ trình'}</span>
            <h3 className="!m-0 !text-sm !font-semibold">{i + 1}. {PHASE_LABELS[p.key] || p.key}</h3>
            <p className="m-0 mt-1 text-xs tabular-nums">{p.weeks} tuần{p.weeklyVolumeKm != null ? `, ${p.weeklyVolumeKm} km/tuần` : ''}</p>
            {p.startDate && p.endDate && <p className="m-0 mt-1 text-xs tabular-nums">{dayjs(p.startDate).format('DD/MM')} – {dayjs(p.endDate).format('DD/MM')}</p>}
            <p className="m-0 mt-2 text-xs" style={{ color: 'var(--st-ink-secondary)' }}>{PHASE_DESCRIPTIONS[p.key]}</p>
          </li>;
        })}
      </ol> : <p className="m-0 text-sm" style={{ color: 'var(--st-ink-secondary)' }}>Kế hoạch này chưa chia giai đoạn.</p>}
      <div className="mt-4">
        <h3 className="!m-0 !mb-2 !text-sm !font-semibold">Lịch tuần mẫu{phase ? `: ${PHASE_LABELS[phase.key] || phase.key}` : ''}</h3>
        {phase?.week?.length ? <div className="st-week-scroll" tabIndex={0} role="region" aria-label="Lịch tuần mẫu của giai đoạn">
          <div className="st-week-template">{WEEK_DAYS.map(day => {
            const work = phase.week.filter(d => d.day === day.day);
            return <div key={day.day} className="st-week-day">
              <div className="st-week-day-label">{day.short}</div>
              {work.length ? work.map(d => <div key={d.slot || 'morning'} className="mt-2">
                <div className="text-[11px]" style={{ color: 'var(--st-ink-secondary)' }}>{d.slot === 'afternoon' ? 'Chiều' : 'Sáng'}</div>
                <div className="text-xs font-semibold">{d.kind === 'rest' ? 'Nghỉ' : SESSION_KINDS[d.kind]?.short || d.kind}</div>
                {d.distanceM > 0 && <div className="text-xs tabular-nums" style={{ color: 'var(--st-ink-secondary)' }}>{d.distanceM.toLocaleString('vi-VN')} m</div>}
              </div>) : <span className="text-xs" style={{ color: 'var(--st-ink-secondary)' }}>Không xếp</span>}
            </div>;
          })}</div>
        </div> : <p className="m-0 text-xs" style={{ color: 'var(--st-ink-secondary)' }}>Chưa cấu hình lịch tuần mẫu cho giai đoạn này. Các buổi đã xếp vẫn xem được trong lịch tập.</p>}
      </div>
    </section>
  );
}
