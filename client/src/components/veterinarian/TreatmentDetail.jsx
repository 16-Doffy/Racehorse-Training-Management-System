import { Button } from 'react-bootstrap';
import { periodOf } from './TreatmentList';
import { HealthPill, HorseAvatar, LevelPill, Pill, Progress, TimeChips } from './ui';
import { LEVEL_META, fmtDate, fmtShort, horseFacts, isMedActive, medTimes, routeLabel, treatmentLevel } from './vetFormat';

/**
 * One treatment, all of it, for the drawer: the horse, the level and the period, today's doses as the
 * groom has recorded them, every medicine with its route, times and instructions, the care orders,
 * and the exam it was written against (onOpenExam opens that exam in the same drawer).
 */
export default function TreatmentDetail({ treatment: t, horse, progress, onOpenExam }) {
  const ongoing = t.status === 'ongoing';
  const level = treatmentLevel(t);
  const period = periodOf(t);
  const p = progress?.progress;
  const meds = t.medications || [];
  const who = horse || t.horse;

  return (
    <div className="vet-stack" style={{ gap: 14 }}>
      <div className="d-flex align-items-center gap-3">
        <HorseAvatar horse={who} size={44} />
        <div style={{ minWidth: 0 }}>
          <div className="vet-sheet-horse">{who?.name || 'Ngựa'}</div>
          <div className="vet-small vet-muted">{horseFacts(who)}</div>
        </div>
        {who?.healthStatus && (
          <span className="ms-auto">
            <HealthPill status={who.healthStatus} />
          </span>
        )}
      </div>

      <div className="vet-subtle p-3">
        <div className="d-flex flex-wrap align-items-center gap-2">
          {ongoing ? <Pill tone="good" icon="bi-capsule">Đang điều trị</Pill> : <Pill tone="neutral">{t.replacedBy ? 'Đã được thay bằng đơn mới' : `Đã kết thúc ${fmtDate(t.endDate || t.updatedAt)}`}</Pill>}
          {ongoing && <LevelPill level={level} short />}
          <span className="vet-small vet-muted">
            {period.range} · {period.label}
          </span>
        </div>
        {ongoing && period.pct !== null && (
          <div className="mt-2">
            <Progress value={period.pct} max={100} tone={period.late ? 'watch' : 'info'} />
          </div>
        )}
        <dl className="vet-sheet-facts mt-3">
          <dt>Bác sĩ kê</dt>
          <dd>{t.prescribedBy?.name || '—'}</dd>
          <dt>Mức vận động</dt>
          <dd>
            {ongoing ? LEVEL_META[level].label : 'Hết hạn chế theo đơn này'}
            {ongoing && level !== 'high' && t.lockReason ? <div className="vet-small vet-muted">{t.lockReason}</div> : null}
          </dd>
          <dt>Theo phiếu khám</dt>
          <dd>
            {t.healthRecord && onOpenExam ? (
              <button type="button" className="vet-link" onClick={onOpenExam}>
                <i className="bi bi-clipboard2-pulse" aria-hidden="true" /> Xem phiếu khám
              </button>
            ) : (
              '—'
            )}
          </dd>
          {t.replaces && (
            <>
              <dt>Thay cho</dt>
              <dd>Một đơn trước của ngựa (đơn cũ đã kết thúc khi kê đơn này)</dd>
            </>
          )}
        </dl>
      </div>

      {ongoing && (
        <div>
          <div className="vet-sheet-label">Hôm nay</div>
          {p?.total > 0 ? (
            <div className="vet-tx-today-box">
              <div className="d-flex align-items-baseline gap-2">
                <strong className="fs-5 vet-tnum">
                  {p.done}/{p.total}
                </strong>
                <span className="vet-muted">liều và việc đã làm</span>
              </div>
              <Progress value={p.done} max={p.total} tone={p.missed || p.notDone ? 'bad' : 'good'} />
              <div className="d-flex flex-wrap gap-2 mt-2">
                {p.waiting + (p.acknowledged || 0) > 0 && <Pill tone="info">{p.waiting + (p.acknowledged || 0)} chưa tới giờ / đang làm</Pill>}
                {p.missed > 0 && <Pill tone="bad">{p.missed} bỏ lỡ</Pill>}
                {p.notDone > 0 && <Pill tone="bad">{p.notDone} không cho được</Pill>}
              </div>
            </div>
          ) : (
            <div className="vet-small vet-faint">Hôm nay không còn liều nào: đã qua giờ cho thuốc, hoặc ngựa chưa có người chăm sóc phụ trách.</div>
          )}
        </div>
      )}

      <div>
        <div className="vet-sheet-label">Thuốc ({meds.length})</div>
        {meds.length === 0 ? (
          <div className="vet-small vet-faint">Đơn không kê thuốc.</div>
        ) : (
          <ul className="vet-meds mt-0">
            {meds.map((m, i) => {
              const stopped = !isMedActive(m);
              return (
                // eslint-disable-next-line react/no-array-index-key
                <li key={`${m.name}-${i}`} className={stopped ? 'is-stopped' : ''} style={{ alignItems: 'flex-start' }}>
                  <i className="bi bi-capsule mt-1" aria-hidden="true" />
                  <div className="vet-med-line" style={{ flex: 1 }}>
                    <div>
                      <strong>{m.name}</strong>
                      {stopped && <span className="vet-faint"> (đã dừng)</span>}
                    </div>
                    <div className="vet-small vet-muted">{[m.dosage, routeLabel(m.route), m.frequency].filter(Boolean).join(' · ')}</div>
                    {m.instructions && <div className="vet-small">{m.instructions}</div>}
                    {(m.startDate || m.endDate) && (
                      <div className="vet-small vet-faint">
                        {m.startDate ? `Từ ${fmtShort(m.startDate)}` : ''}
                        {m.endDate ? ` đến ${fmtShort(m.endDate)}` : ''}
                      </div>
                    )}
                  </div>
                  <TimeChips times={medTimes(m)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <div className="vet-sheet-label">Y lệnh chăm sóc</div>
        {t.careInstructions ? <div style={{ whiteSpace: 'pre-wrap' }}>{t.careInstructions}</div> : <div className="vet-small vet-faint">Không có y lệnh chăm sóc.</div>}
      </div>
    </div>
  );
}

/** The drawer's buttons for a treatment still running. */
export function TreatmentActions({ treatment: t, onEnd, onReplace, onLevel }) {
  if (t.status !== 'ongoing') return null;
  return (
    <>
      {onLevel && (
        <Button variant="vet-ghost" className="me-auto" onClick={onLevel}>
          <i className="bi bi-speedometer2" aria-hidden="true" /> Đổi mức tập
        </Button>
      )}
      {onReplace && (
        <Button variant="vet-outline" onClick={onReplace}>
          <i className="bi bi-arrow-repeat" aria-hidden="true" /> Kê đơn mới thay đơn này
        </Button>
      )}
      {onEnd && (
        <Button variant="vet" onClick={onEnd}>
          Kết thúc điều trị
        </Button>
      )}
    </>
  );
}
