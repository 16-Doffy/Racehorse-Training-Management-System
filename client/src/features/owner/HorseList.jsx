import { Link } from 'react-router-dom';
import { RightOutlined } from '@ant-design/icons';
import { HealthPill, HorseAvatar, Pill } from './kit';
import { capFirst, fmtDateTime, fmtShort, horseFacts, idOf } from './ownerFormat';
import { stallText } from './useOwnerData';

/**
 * The owner's horses as a list, a row a horse (GET /horses/owner-summary rows): who it is, how it is,
 * where it lives, what it does next and the race ahead — the row opens the horse's page. `compact`
 * leaves out the stall and the race (the home page's short list). Cards on a phone.
 */
export default function HorseList({ rows, horsesById, stallOf, stallsLoaded = true, compact = false }) {
  return (
    <div className={`own-hl${compact ? ' is-compact' : ''}`} role="table" aria-label="Danh sách chiến mã">
      <div className="own-hl-head" role="row">
        <span>Chiến mã</span>
        <span>Sức khỏe</span>
        {!compact && <span>Chuồng</span>}
        <span>Buổi tập tiếp theo</span>
        {!compact && <span>Giải sắp tới</span>}
        <span aria-hidden="true" />
      </div>
      {rows.map((r) => {
        const id = idOf(r.horse);
        const horse = horsesById.get(id) || r.horse;
        const race = r.upcomingRace;
        const examined = Boolean(r.health.lastExam);
        return (
          <Link key={id} to={`/horses/${id}`} className="own-hl-row" role="row">
            <span className="own-hl-horse">
              <HorseAvatar horse={horse} size={38} />
              <span className="min-w-0">
                <b>{r.horse.name}</b>
                <span>{horseFacts(horse) || '—'}</span>
              </span>
            </span>
            <span className="own-hl-health">
              <HealthPill status={r.health.status} examined={examined} />
              {r.health.restricted && <span className="own-hl-note is-bad">{capFirst(r.health.clearance)}</span>}
            </span>
            {!compact && <span className="own-hl-cell">{stallsLoaded ? stallText(stallOf?.get(id)) || <span className="own-faint">Chưa xếp chuồng</span> : '—'}</span>}
            <span className="own-hl-cell">
              {r.next ? (
                <>
                  <b>{r.next.kind}</b>
                  <span>{fmtDateTime(r.next.at)}</span>
                </>
              ) : (
                <span className="own-faint">Chưa xếp buổi tập</span>
              )}
            </span>
            {!compact && (
              <span className="own-hl-cell">
                {race ? (
                  <>
                    <b>{race.name}</b>
                    <span className="own-hl-race">
                      {fmtShort(race.date)}
                      <Pill tone={race.reviewNeeded ? 'watch' : race.status === 'confirmed' ? 'good' : 'neutral'}>
                        {race.reviewNeeded ? 'HLV xem lại' : race.status === 'confirmed' ? 'Đã xác nhận' : 'Chờ HLV'}
                      </Pill>
                    </span>
                  </>
                ) : (
                  <span className="own-faint">Chưa đăng ký giải</span>
                )}
              </span>
            )}
            <RightOutlined className="own-hl-go" aria-hidden="true" />
          </Link>
        );
      })}
    </div>
  );
}
