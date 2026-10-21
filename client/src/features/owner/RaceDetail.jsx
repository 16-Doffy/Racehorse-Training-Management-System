import { useMemo } from 'react';
import { CalendarOutlined, DollarOutlined, FlagOutlined, StopOutlined, TrophyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Card, DateChip, EmptyNote, Pill, Row, Stats } from './kit';
import { RACE_STATUS, SURFACE_LABELS, fmtDate, idOf, money, placeText, relDay, weekday } from './ownerFormat';
import { horseName } from './ownerInsights';
import { useRaces } from './useOwnerData';

const where = (r) => [r.venue, r.distance && `${r.distance} m`, SURFACE_LABELS[r.surface]].filter(Boolean).join(' · ');

/**
 * The races of one horse (horseId) or of all the owner's horses: the coming ones with the trainer's
 * decision, the results with place and prize, and the entries that were withdrawn.
 */
export default function RaceDetail({ horses, horseId = null }) {
  const { races, isLoading } = useRaces();
  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  const multi = !horseId && horses.length > 1;
  const today = dayjs().startOf('day');

  const mine = useMemo(() => {
    const ids = new Set(horseId ? [String(horseId)] : horsesById.keys());
    return races.filter((r) => ids.has(idOf(r.horse)));
  }, [races, horseId, horsesById]);
  const coming = mine.filter((r) => ['registered', 'confirmed'].includes(r.status) && !dayjs(r.raceDate).isBefore(today)).sort((a, b) => new Date(a.raceDate) - new Date(b.raceDate));
  const results = mine.filter((r) => r.status === 'completed').sort((a, b) => new Date(b.raceDate) - new Date(a.raceDate));
  const withdrawn = mine.filter((r) => r.status === 'withdrawn').sort((a, b) => new Date(b.raceDate) - new Date(a.raceDate));
  const wins = results.filter((r) => r.position === 1).length;
  const podiums = results.filter((r) => r.position && r.position <= 3).length;
  const prize = results.reduce((t, r) => t + (r.prizeMoney || 0), 0);
  const who = (r) => (multi ? `${horseName(r.horse, horsesById)} · ` : '');

  return (
    <div className="flex flex-col gap-4">
      <Stats
        items={[
          { label: 'Sắp thi đấu', icon: <CalendarOutlined />, value: coming.length, sub: coming[0] ? `Gần nhất ${fmtDate(coming[0].raceDate)}` : 'Chưa đăng ký giải nào' },
          { label: 'Đã thi đấu', icon: <FlagOutlined />, value: results.length, sub: results.length ? `${podiums} lần vào top 3` : 'Chưa có kết quả' },
          { label: 'Về nhất', icon: <TrophyOutlined />, value: wins, tone: wins ? 'good' : undefined, sub: results.length ? `${Math.round((wins / results.length) * 100)}% số giải` : '—' },
          { label: 'Tổng tiền thưởng', icon: <DollarOutlined />, value: money(prize), sub: 'Tự ghi vào sổ thu chi khi có kết quả' },
        ]}
      />

      <Card title="Giải sắp tới" icon={<CalendarOutlined />} flush>
        {coming.length === 0 ? (
          <EmptyNote>{isLoading ? 'Đang tải…' : 'Chưa có giải nào sắp tới. HLV đăng ký giải khi ngựa sẵn sàng.'}</EmptyNote>
        ) : (
          <ul className="own-list">
            {coming.map((r) => {
              const status = RACE_STATUS[r.status];
              return (
                <li key={r._id}>
                  <Row lead={<DateChip date={r.raceDate} sub={weekday(r.raceDate)} />} title={r.raceName} sub={`${who(r)}${[where(r), relDay(r.raceDate)].filter(Boolean).join(' · ')}`} side={<Pill tone={r.reviewNeeded ? 'watch' : status.tone}>{r.reviewNeeded ? 'HLV đang xem lại' : status.label}</Pill>}>
                    {r.reviewNeeded ? (
                      <div className="own-row-sub own-watch">Sức khỏe của ngựa đã thay đổi sau khi được xác nhận — HLV sẽ quyết định lại.</div>
                    ) : r.status === 'confirmed' ? (
                      <div className="own-row-sub">
                        HLV đã xác nhận tham gia{r.decision?.at ? ` ngày ${fmtDate(r.decision.at)}` : ''}
                        {r.decision?.reason ? ` — ${r.decision.reason}` : r.decision?.trialMet ? ' dựa trên buổi chạy thử đạt chỉ tiêu' : ''}.
                      </div>
                    ) : (
                      <div className="own-row-sub">HLV sẽ quyết định cho ngựa tham gia hay rút, thường dựa trên buổi chạy thử trước giải.</div>
                    )}
                  </Row>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Kết quả thi đấu" icon={<TrophyOutlined />} flush>
        {results.length === 0 ? (
          <EmptyNote>Chưa có giải nào hoàn tất.</EmptyNote>
        ) : (
          <ul className="own-list">
            {results.map((r) => (
              <li key={r._id}>
                <Row
                  lead={
                    <span className={`own-icon is-${r.position === 1 ? 'brass' : r.position && r.position <= 3 ? 'good' : 'info'}`}>
                      <TrophyOutlined />
                    </span>
                  }
                  title={r.raceName}
                  sub={`${who(r)}${[fmtDate(r.raceDate), where(r), r.finishTime && `thời gian ${r.finishTime}`].filter(Boolean).join(' · ')}`}
                  side={
                    <>
                      <Pill tone={r.position === 1 ? 'brass' : r.position && r.position <= 3 ? 'good' : 'neutral'} dot={false}>
                        {r.result || placeText(r.position)}
                      </Pill>
                      {r.prizeMoney > 0 && <span className="own-good own-num text-sm font-semibold">{money(r.prizeMoney)}</span>}
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {withdrawn.length > 0 && (
        <Card title="Đã rút" icon={<StopOutlined />} flush>
          <ul className="own-list">
            {withdrawn.map((r) => (
              <li key={r._id}>
                <Row lead={<DateChip date={r.raceDate} sub={weekday(r.raceDate)} />} title={r.raceName} sub={`${who(r)}${r.decision?.reason ? `Lý do: ${r.decision.reason}` : fmtDate(r.raceDate)}`} side={<Pill>{RACE_STATUS.withdrawn.label}</Pill>} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
