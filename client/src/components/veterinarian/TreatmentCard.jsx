import { Button } from 'react-bootstrap';
import { ActionMenu, HorseAvatar, LevelPill, Pill, Progress, TimeChips } from './ui';
import { fmtShort, isMedActive, medTimes, periodText, routeLabel, treatmentLevel } from './vetFormat';

/**
 * One treatment as the vet reads it: the medicines with their times, the training level it sets,
 * the care orders, and — while it runs — how far the groom has got with today's doses.
 *
 * progress: the treatment's row from GET /health/care-orders (today), when there is one.
 * awaitingReturn: it ended while still restricting and nobody has cleared the horse since.
 */
export default function TreatmentCard({ treatment: t, progress, showHorse = false, awaitingReturn = false, onEdit, onEnd, onLevel, onOpenHorse }) {
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
        <span className="vet-small vet-muted">{ongoing ? periodText(t.startDate || t.createdAt, t.endDate) : `Từ ${fmtShort(t.startDate || t.createdAt)}`}</span>

        <div className="vet-tr-actions">
          {ongoing && p && p.total > 0 && (
            <div className="vet-tr-progress" title={`Hôm nay: ${p.done} đã cho, ${p.waiting + p.acknowledged} chưa tới / đang chờ, ${p.missed} bỏ lỡ, ${p.notDone} không cho được`}>
              <span className="vet-small vet-tnum">
                Hôm nay <strong>{p.done}</strong>/{p.total}
              </span>
              <Progress value={p.done} max={p.total} tone={p.missed || p.notDone ? 'bad' : 'good'} />
            </div>
          )}
          {ongoing && onEdit && (
            <Button size="sm" variant="vet-outline" onClick={onEdit}>
              Sửa
            </Button>
          )}
          {ongoing && (onEnd || onLevel) && (
            <ActionMenu
              items={[
                onLevel && { label: 'Đổi mức tập', icon: 'bi-speedometer2', onClick: onLevel },
                onEnd && { label: 'Kết thúc điều trị', icon: 'bi-check2-square', onClick: onEnd },
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
                <div style={{ minWidth: 0 }}>
                  <div>
                    <strong>{m.name}</strong>
                    <span className="vet-muted"> — {[m.dosage, routeLabel(m.route)].filter(Boolean).join(' · ')}</span>
                    {stopped && <span className="vet-small vet-faint"> (đã dừng)</span>}
                  </div>
                  {m.instructions && <div className="vet-small vet-muted">{m.instructions}</div>}
                  {(m.startDate || m.endDate) && (
                    <div className="vet-small vet-faint">
                      {m.startDate ? `Từ ${fmtShort(m.startDate)}` : ''}
                      {m.endDate ? ` đến ${fmtShort(m.endDate)}` : ''}
                    </div>
                  )}
                </div>
                <div className="ms-auto">
                  <TimeChips times={medTimes(m)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {t.careInstructions && (
        <div className="vet-small mt-2">
          <span className="vet-faint">Y lệnh chăm sóc:</span> {t.careInstructions}
        </div>
      )}
      {ongoing && level !== 'high' && t.lockReason && (
        <div className="vet-small mt-1">
          <span className="vet-faint">Lý do hạn chế tập:</span> {t.lockReason}
        </div>
      )}
      {meds.length === 0 && !t.careInstructions && !(ongoing && level !== 'high') && <div className="vet-small vet-faint mt-1">Không kê thuốc.</div>}
      {t.prescribedBy?.name && <div className="vet-small vet-faint mt-2">Kê bởi {t.prescribedBy.name}</div>}
    </div>
  );
}
