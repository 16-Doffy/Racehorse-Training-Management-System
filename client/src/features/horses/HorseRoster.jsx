import { Button, Tooltip } from 'antd';
import { CalendarOutlined, HomeOutlined, RightOutlined, TeamOutlined, TrophyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { HORSE_SEX_LABELS } from '../../constants/horse';
import { PHASE_SHORT, SESSION_KINDS, sessionTimeLabel } from '../training/trainingVocab';
import { coatFor } from './horse3d/horseBreeds';
import { ageOf, breedVi, standingOf } from './horseStanding';
import HorseNextStep from './HorseNextStep';
import './horseList.css';

/** The counts on top of the list, each one a filter: icon, number, what it counts. */
export function RosterTiles({ tiles, focus, onPick }) {
  return (
    <div className="hl-tiles" role="group" aria-label="Lọc đàn ngựa">
      {tiles.map((t) => {
        const on = focus === t.key;
        return (
          <button key={t.key} type="button" aria-pressed={on} onClick={() => onPick(t.key, on)} className={`hl-tile is-${t.tone}${on ? ' is-on' : ''}`}>
            <span className="hl-tile-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span className="min-w-0">
              <span className="hl-tile-label">{t.label}</span>
              <span className="hl-tile-value">
                {t.value}
                <small> ngựa</small>
              </span>
              <span className="hl-tile-note">{t.note}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The horse's training plan in a few lines: its stage and week (with a bar), the race ahead, the next session. */
function PlanBlock({ plan, onPlan }) {
  if (!plan) {
    return (
      <div className="hl-plan is-empty">
        <span>Chưa có kế hoạch huấn luyện</span>
        <Button size="small" type="link" className="!p-0" onClick={onPlan}>
          Lập kế hoạch →
        </Button>
      </div>
    );
  }
  const g = plan.progress || {};
  const where = !g.started ? `Bắt đầu ${dayjs(plan.startDate).format('DD/MM')}` : g.ended ? 'Đã hết kế hoạch' : `${PHASE_SHORT[plan.phase] || 'Đang tập'} · tuần ${g.week}/${g.totalWeeks}`;
  const pct = g.started && g.totalWeeks ? Math.min(100, Math.round((g.week / g.totalWeeks) * 100)) : 0;
  const next = g.upcoming?.[0];
  return (
    <div className="hl-plan">
      <div className="hl-plan-where">{where}</div>
      <div className="hl-plan-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="hl-plan-lines">
        {plan.targetRace && g.raceInDays >= 0 && (
          <Tooltip title={plan.targetRace.raceName}>
            <span className="hl-race">
              <TrophyOutlined /> Giải {g.raceInDays ? `còn ${g.raceInDays} ngày` : 'hôm nay'}
            </span>
          </Tooltip>
        )}
        <span className="hl-next">
          <CalendarOutlined /> {next ? `${SESSION_KINDS[next.kind]?.short || SESSION_KINDS[next.kind]?.label || 'Buổi tập'} · ${sessionTimeLabel(next.scheduledAt)}` : 'Chưa có buổi trong 2 tuần tới'}
        </span>
      </div>
    </div>
  );
}

/**
 * One horse as a card: who it is (a disc in its coat colour), where it stands (fit, limited, off work) as a
 * coloured edge and badge, its stall and vet, its plan, its next step — then the trainer's two ways on.
 */
export function HorseCard({ h, stall, plan, checklist, examined, onOpen, onSessions, onPlan }) {
  const standing = standingOf(h, examined);
  const coat = coatFor({ breed: h.breed, color: h.color });
  const facts = [breedVi(h.breed), HORSE_SEX_LABELS[h.sex], ageOf(h.dob)].filter(Boolean).join(' · ') || 'Chưa có lý lịch';
  return (
    <article className={`hl-card is-${standing.tone}`} onClick={onOpen} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()} aria-label={`Mở hồ sơ ${h.name}`}>
      <header className="hl-card-head">
        <span className="hl-avatar" style={{ background: coat.swatch }} aria-hidden="true">
          {h.name?.[0]}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="hl-name">{h.name}</h3>
          <div className="hl-facts" title={facts}>
            {facts}
          </div>
        </div>
        <span className={`hl-badge is-${standing.tone}`}>
          {standing.icon} {standing.label}
        </span>
      </header>

      <div className="hl-training">
        <span className={`hl-dot is-${standing.tone}`} aria-hidden="true" /> {standing.training}
        {h.trainingClearance?.reason && <span className="hl-reason" title={h.trainingClearance.reason}> — {h.trainingClearance.reason}</span>}
      </div>

      <div className="hl-meta">
        <span title="Chuồng">
          <HomeOutlined /> {stall ? `Chuồng ${stall}` : 'Chưa xếp chuồng'}
        </span>
        <span title="Bác sĩ phụ trách">
          <TeamOutlined /> BS {h.assignedVet?.name || 'chưa phân công'}
        </span>
      </div>

      <div className="hl-section-label">Kế hoạch</div>
      <PlanBlock plan={plan} onPlan={(e) => { e?.stopPropagation?.(); onPlan(); }} />

      <div className="hl-section-label">Bước tiếp theo</div>
      <div className="hl-step">
        <HorseNextStep checklist={checklist} />
      </div>

      <footer className="hl-card-foot" onClick={(e) => e.stopPropagation()}>
        <Button size="small" onClick={onSessions}>
          <CalendarOutlined /> Lịch tập
        </Button>
        <Button size="small" type="text" className="hl-open" onClick={onOpen}>
          Xem hồ sơ <RightOutlined />
        </Button>
      </footer>
    </article>
  );
}
