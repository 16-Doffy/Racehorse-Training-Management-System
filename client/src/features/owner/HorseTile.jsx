import { Link } from 'react-router-dom';
import { EnvironmentOutlined } from '@ant-design/icons';
import { HealthPill, HorseAvatar, Pill } from './kit';
import { capFirst, fmtDateTime, fmtShort, horseFacts, money, placeText } from './ownerFormat';
import { stallText } from './useOwnerData';

const lastResult = (last) => {
  if (!last) return 'Chưa có buổi tập nào';
  const how = last.status === 'aborted' ? 'dừng giữa chừng' : last.met === true ? 'đạt' : last.met === false ? 'chưa đạt' : 'đã xong';
  return `${last.kind} · ${how}${last.rating ? ` · ${last.rating}/10` : ''}`;
};

/**
 * One of the owner's horses at a glance (a row of GET /horses/owner-summary, with the horse record
 * and its stall): health, what comes next, how it went last, races and this year's money. The whole
 * card opens the horse's page.
 */
export default function HorseTile({ row, horse, stall, stallsLoaded = true }) {
  const id = row.horse._id;
  const race = row.upcomingRace;
  const where = stallText(stall);
  return (
    <Link className="own-horse" to={`/horses/${id}`}>
      <div className="own-horse-top">
        <HorseAvatar horse={horse || row.horse} size={46} />
        <div className="min-w-0 flex-1">
          <div className="own-horse-name">{row.horse.name}</div>
          {horse && <div className="own-horse-meta">{horseFacts(horse)}</div>}
          {stallsLoaded && (
            <div className="own-horse-meta">
              <EnvironmentOutlined /> <span>{where || 'Chưa xếp chuồng'}</span>
            </div>
          )}
        </div>
        <HealthPill status={row.health.status} examined={Boolean(row.health.lastExam)} />
      </div>
      {row.health.restricted && (
        <div className="own-horse-reason">
          {capFirst(row.health.clearance)}
          {row.health.reason ? ` — ${row.health.reason}` : ''}
        </div>
      )}
      <div className="own-kv">
        <div className="own-kv-item">
          <div className="own-kv-label">Việc tiếp theo</div>
          <div className="own-kv-value">{row.next ? `${row.next.kind} · ${fmtDateTime(row.next.at)}` : 'Chưa xếp buổi tập'}</div>
        </div>
        <div className="own-kv-item">
          <div className="own-kv-label">Kết quả gần nhất</div>
          <div className="own-kv-value" title={row.last?.summary || undefined}>
            {lastResult(row.last)}
          </div>
        </div>
        <div className="own-kv-item">
          <div className="own-kv-label">{!race && row.lastRace ? 'Giải gần nhất' : 'Giải sắp tới'}</div>
          <div className="own-kv-value">
            {race ? `${race.name} · ${fmtShort(race.date)}` : row.lastRace ? `${row.lastRace.name} — ${row.lastRace.result || placeText(row.lastRace.position)}` : 'Chưa đăng ký giải'}
          </div>
          {race && (
            <div className="mt-1">
              <Pill tone={race.reviewNeeded ? 'watch' : race.status === 'confirmed' ? 'info' : 'neutral'}>
                {race.reviewNeeded ? 'HLV đang xem lại' : race.status === 'confirmed' ? 'Đã xác nhận' : 'Chờ HLV quyết định'}
              </Pill>
            </div>
          )}
        </div>
        <div className="own-kv-item">
          <div className="own-kv-label">Thu / chi năm {row.money.year}</div>
          <div className="own-kv-value own-num">
            {row.money.revenue || row.money.cost ? (
              <>
                <span className="own-good">+{money(row.money.revenue)}</span> · <span className="own-bad">−{money(row.money.cost)}</span>
              </>
            ) : (
              'Chưa có khoản nào'
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
