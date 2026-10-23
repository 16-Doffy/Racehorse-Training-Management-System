import { Button } from 'react-bootstrap';
import { ActionMenu, HorseAvatar, LevelPill, Pill, Progress, TimeChips } from './ui';
import { fmtShort, isMedActive, medTimes, periodText, routeLabel, treatmentLevel } from './vetFormat';

/**
 * One treatment as the vet reads it: the medicines with their times, the training level it sets,
 * the care orders, and — while it runs — how far the groom has got with today's doses.
 *
 * An issued prescription is not edited: it is ended, or replaced by a new one (onReplace).
 *
 * progress: the treatment's row from GET /health/care-orders (today), when there is one.
 * awaitingReturn: it ended while still restricting and nobody has cleared the horse since.
 */
export default function TreatmentCard({ treatment: t, progress, showHorse = false, awaitingReturn = false, onReplace, onEnd, onLevel, onOpenHorse, onOpenExam }) {
  const ongoing = t.status === 'ongoing';
  const level = treatmentLevel(t);
  const meds = t.medications || [];
  const p = progress?.progress;

  return (
    <div className={`vet-tr${ongoing ? '' : ' is-ended'}`}>
      <div className="vet-tr-head">
        {showHorse && (
          <button type="button" className="vet-tr-horse" onClick={onOpenHorse} title="Mở hồ sơ ngựa">
            <HorseAvatar horse={t.horse} size={34} />
            <span className="vet-row-title">{t.horse?.name || 'Ngựa'}</span>
          </button>
        )}
        {ongoing ? level !== 'high' && <LevelPill level={level} short title={t.lockReason || undefined} /> : <Pill tone="neutral">Đã kết thúc {fmtShort(t.endDate || t.updatedAt)}</Pill>}
        {awaitingReturn && (
          <Pill tone="watch" icon="bi-hourglass-split">
            Chờ đánh giá cho tập lại
          </Pill>
        )}
        <span className="vet-small vet-muted">
          {ongoing ? periodText(t.startDate || t.createdAt, t.endDate) : `Từ ${fmtShort(t.startDate || t.createdAt)}`}
          {t.prescribedBy?.name ? ` · BS ${t.prescribedBy.name}` : ''}
        </span>
        {onOpenExam && t.healthRecord && (
          <button type="button" className="vet-link vet-small" onClick={onOpenExam} title="Mở phiếu khám của đơn này">
            <i className="bi bi-clipboard2-pulse" aria-hidden="true" /> Phiếu khám
          </button>
        )}
        {t.replacedBy && <Pill tone="neutral">Đã được thay bằng đơn mới</Pill>}

        <div className="vet-tr-actions">
          {ongoing && p && p.total > 0 && (
            <div className="vet-tr-progress" title={`Hôm nay: ${p.done} đã cho, ${p.waiting + p.acknowledged} chưa tới / đang chờ, ${p.missed} bỏ lỡ, ${p.notDone} không cho được`}>
              <span className="vet-small vet-tnum">
                Hôm nay <strong>{p.done}</strong>/{p.total}
              </span>
              <Progress value={p.done} max={p.total} tone={p.missed || p.notDone ? 'bad' : 'good'} />
            </div>
          )}
          {ongoing && onEnd && (
            <Button size="sm" variant="vet-outline" onClick={onEnd}>
              Kết thúc
            </Button>
          )}
          {ongoing && (onReplace || onLevel) && (
            <ActionMenu
              items={[
                onReplace && { label: 'Kê đơn mới thay đơn này', icon: 'bi-arrow-repeat', onClick: onReplace },
                onLevel && { label: 'Đổi mức tập', icon: 'bi-speedometer2', onClick: onLevel },
              ]}
            />
          )}
        </div>
      </div>

      {(p?.missed > 0 || p?.notDone > 0) && (
        <div className="vet-small vet-text-bad mt-1">
          {p.missed > 0 && <>{p.missed} liều bỏ lỡ hôm nay. </>}
          {p.notDone > 0 && <>{p.notDone} việc không thực hiện được — xem lý do trong ngày.</>}
        </div>
      )}

      {meds.length > 0 && (
        <ul className="vet-meds">
          {meds.map((m, i) => {
            const stopped = !isMedActive(m);
            return (
              // eslint-disable-next-line react/no-array-index-key
              <li key={`${m.name}-${i}`} className={stopped ? 'is-stopped' : ''}>
                <i className="bi bi-capsule" aria-hidden="true" />
                <div className="vet-med-line">
                  <strong>{m.name}</strong>
                  <span className="vet-muted"> · {[m.dosage, routeLabel(m.route)].filter(Boolean).join(' · ')}</span>
                  {m.instructions && <span className="vet-faint"> — {m.instructions}</span>}
                  {(m.startDate || m.endDate) && (
                    <span className="vet-faint">
                      {' '}
                      ({m.startDate ? `từ ${fmtShort(m.startDate)}` : ''}
                      {m.endDate ? ` đến ${fmtShort(m.endDate)}` : ''})
                    </span>
                  )}
                  {stopped && <span className="vet-faint"> (đã dừng)</span>}
                </div>
                <div className="ms-auto flex-shrink-0">
                  <TimeChips times={medTimes(m)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(t.careInstructions || (ongoing && level !== 'high' && t.lockReason)) && (
        <dl className="vet-tr-notes">
          {t.careInstructions && (
            <>
              <dt>Y lệnh</dt>
              <dd>{t.careInstructions}</dd>
            </>
          )}
          {ongoing && level !== 'high' && t.lockReason && (
            <>
              <dt>Hạn chế tập</dt>
              <dd>{t.lockReason}</dd>
            </>
          )}
        </dl>
      )}
      {meds.length === 0 && !t.careInstructions && !(ongoing && level !== 'high') && <div className="vet-small vet-faint mt-1">Không kê thuốc.</div>}
    </div>
  );
}
