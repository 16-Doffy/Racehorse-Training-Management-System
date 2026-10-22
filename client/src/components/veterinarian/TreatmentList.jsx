import { Button } from 'react-bootstrap';
import { ActionMenu, HorseAvatar, LevelPill, Pill, Progress } from './ui';
import { daysUntil, fmtShort, isMedActive, medTimes, treatmentLevel } from './vetFormat';

/** Where a treatment is in its period: "23/10 → 27/10", day 2 of 5. */
export function periodOf(t) {
  const start = t.startDate || t.createdAt;
  const end = t.endDate;
  const day = Math.max(1, -daysUntil(start) + 1);
  if (!end) return { range: `Từ ${fmtShort(start)}`, label: `ngày ${day}`, pct: null };
  const total = Math.max(1, daysUntil(end) - daysUntil(start) + 1);
  return { range: `${fmtShort(start)} → ${fmtShort(end)}`, label: day > total ? 'quá hạn dự kiến' : `ngày ${Math.min(day, total)}/${total}`, pct: Math.min(100, Math.round((Math.min(day, total) / total) * 100)), late: day > total };
}

/** "Penicillin tiêm, Banamine" and "2 thuốc · 3 liều/ngày · có y lệnh". */
export function medsSummary(t) {
  const active = (t.medications || []).filter(isMedActive);
  const doses = active.reduce((sum, m) => sum + (medTimes(m).length || 1), 0);
  return {
    names: active.length ? active.map((m) => m.name).join(', ') : t.careInstructions ? 'Chỉ y lệnh chăm sóc' : 'Không kê thuốc',
    facts: [active.length && `${active.length} thuốc`, doses && `${doses} liều/ngày`, t.careInstructions && 'có y lệnh chăm sóc'].filter(Boolean).join(' · '),
  };
}

/**
 * Treatments as a table, one line each, so a horse with many of them (or the whole stable) still reads
 * at a glance: the horse, how hard it may work, the medicines, where in its period, today's doses.
 * A line opens the treatment in place (onOpen); ending, replacing and the training level are its
 * actions. `showHorse`: a column for the horse (the stable-wide page).
 */
export default function TreatmentList({ treatments, progressOf, showHorse = false, onOpen, onEnd, onReplace, onLevel, onOpenExam, onHorse }) {
  if (!treatments.length) return null;
  return (
    <div className={`vet-tx${showHorse ? ' has-horse' : ''}`} role="table" aria-label="Đơn thuốc">
      <div className="vet-tx-head" role="row">
        {showHorse && <span role="columnheader">Ngựa</span>}
        <span role="columnheader">Mức tập</span>
        <span role="columnheader">Thuốc & y lệnh</span>
        <span role="columnheader">Thời gian</span>
        <span role="columnheader">Hôm nay</span>
        <span role="columnheader" aria-label="Thao tác" />
      </div>
      {treatments.map((t) => {
        const ongoing = t.status === 'ongoing';
        const level = treatmentLevel(t);
        const period = periodOf(t);
        const meds = medsSummary(t);
        const p = progressOf?.(t._id)?.progress;
        const late = (p?.missed || 0) + (p?.notDone || 0);
        const stop = (fn) => (e) => {
          e.stopPropagation();
          fn();
        };
        return (
          <div
            key={t._id}
            className={`vet-tx-row${ongoing ? '' : ' is-ended'}`}
            role="row"
            tabIndex={0}
            onClick={() => onOpen(t)}
            onKeyDown={(e) => e.key === 'Enter' && onOpen(t)}
            title="Xem chi tiết đơn"
          >
            {showHorse && (
              <div className="vet-tx-horse" role="cell">
                <HorseAvatar horse={t.horse} size={30} />
                <button type="button" className="vet-link text-truncate" onClick={onHorse ? stop(() => onHorse(t)) : undefined} title={onHorse ? `Chỉ xem đơn của ${t.horse?.name}` : undefined}>
                  {t.horse?.name || 'Ngựa'}
                </button>
              </div>
            )}
            <div role="cell">
              {ongoing ? (
                level !== 'high' ? (
                  <LevelPill level={level} short title={t.lockReason || undefined} />
                ) : (
                  <Pill tone="neutral">Không hạn chế</Pill>
                )
              ) : (
                <Pill tone="neutral">{t.replacedBy ? 'Đã thay đơn' : `Kết thúc ${fmtShort(t.endDate || t.updatedAt)}`}</Pill>
              )}
            </div>
            <div className="vet-tx-meds" role="cell">
              <div className="vet-tx-names text-truncate">{meds.names}</div>
              <div className="vet-small vet-muted text-truncate">
                {meds.facts}
                {t.prescribedBy?.name ? `${meds.facts ? ' · ' : ''}BS ${t.prescribedBy.name}` : ''}
              </div>
            </div>
            <div className="vet-tx-period" role="cell">
              <div className="vet-tnum">{period.range}</div>
              {ongoing && period.pct !== null ? (
                <div className="vet-tx-bar" title={period.label}>
                  <Progress value={period.pct} max={100} tone={period.late ? 'watch' : 'info'} />
                  <span className={`vet-small ${period.late ? 'vet-text-bad' : 'vet-faint'}`}>{period.label}</span>
                </div>
              ) : (
                <div className="vet-small vet-faint">{ongoing ? period.label : `${(t.medications || []).length} thuốc`}</div>
              )}
            </div>
            <div className="vet-tx-today" role="cell">
              {ongoing && p?.total > 0 ? (
                <>
                  <div className="vet-tnum">
                    <strong>{p.done}</strong>/{p.total} liều
                  </div>
                  <Progress value={p.done} max={p.total} tone={late ? 'bad' : 'good'} />
                  {late > 0 && <div className="vet-small vet-text-bad">{late} chưa cho được</div>}
                </>
              ) : (
                <span className="vet-small vet-faint">{ongoing ? 'Không còn liều' : '—'}</span>
              )}
            </div>
            {/* Its buttons and menu act on their own, without opening the line. */}
            <div className="vet-tx-actions" role="cell" onClick={(e) => e.stopPropagation()}>
              {ongoing && onEnd && (
                <Button size="sm" variant="vet-outline" onClick={() => onEnd(t)}>
                  Kết thúc
                </Button>
              )}
              <ActionMenu
                items={[
                  { label: 'Xem chi tiết đơn', icon: 'bi-card-text', onClick: () => onOpen(t) },
                  onOpenExam && t.healthRecord && { label: 'Phiếu khám của đơn', icon: 'bi-clipboard2-pulse', onClick: () => onOpenExam(t) },
                  ongoing && onReplace && { label: 'Kê đơn mới thay đơn này', icon: 'bi-arrow-repeat', onClick: () => onReplace(t) },
                  ongoing && onLevel && { label: 'Đổi mức tập', icon: 'bi-speedometer2', onClick: () => onLevel(t) },
                ]}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
