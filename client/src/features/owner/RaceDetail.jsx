import { useEffect, useMemo, useState } from 'react';
import { Segmented } from 'antd';
import { CalendarOutlined, CheckOutlined, DollarOutlined, EnvironmentOutlined, FlagOutlined, TrophyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Card, EmptyNote, HorseAvatar, Pill, Stats } from './kit';
import { RACE_STATUS, SURFACE_LABELS, fmtDate, idOf, money } from './ownerFormat';
import { WEEKDAY_FULL, WEEKDAY_SHORT } from './trainingLook';
import { useRaces, useSessions } from './useOwnerData';

const DONE = ['completed', 'evaluated'];
const daysTo = (d) => dayjs(d).startOf('day').diff(dayjs().startOf('day'), 'day');
const countdown = (d) => {
  const n = daysTo(d);
  return n === 0 ? 'Hôm nay' : n === 1 ? 'Ngày mai' : n > 0 ? `Còn ${n} ngày` : `${-n} ngày trước`;
};
const facts = (race) => [race.venue, race.distance && `${race.distance.toLocaleString('vi-VN')} m`, SURFACE_LABELS[race.surface]].filter(Boolean);

/** Where the trainer's decision stands on a horse entered for a race still to come. */
function decisionOf(entry) {
  if (entry.reviewNeeded) return { tone: 'bad', label: 'HLV đang xem lại' };
  if (entry.status === 'confirmed') return { tone: 'good', label: 'Đã xác nhận tham gia' };
  return { tone: 'watch', label: RACE_STATUS.registered.label };
}

/** The horse's trial run for the race: done (met or not), booked, or none yet. */
function trialOf(trial) {
  if (!trial) return { state: 'todo', label: 'Chưa xếp' };
  const at = fmtDate(trial.actualStartAt || trial.scheduledAt);
  if (DONE.includes(trial.status)) {
    if (trial.outcome?.met === true) return { state: 'done', label: `Đạt · ${at}` };
    if (trial.outcome?.met === false) return { state: 'bad', label: `Chưa đạt · ${at}` };
    return { state: 'done', label: `Đã chạy · ${at}` };
  }
  if (['missed', 'aborted'].includes(trial.status)) return { state: 'bad', label: `${trial.status === 'missed' ? 'Lỡ giờ' : 'Dừng giữa chừng'} · ${at}` };
  return { state: 'todo', label: `Hẹn ${at}` };
}

/** A place: gold, silver and bronze for the podium, plain after. */
function Place({ position, result }) {
  const cls = position === 1 ? 'is-1' : position === 2 ? 'is-2' : position === 3 ? 'is-3' : '';
  return (
    <span className={`own-place ${cls}`}>
      {position ? <span className="own-place-n">{position}</span> : null}
      {result || (position === 1 ? 'Về nhất' : position ? `Hạng ${position}` : 'Chưa có kết quả')}
    </span>
  );
}

/**
 * The races the owner's horses are entered for, each race once however many of their horses run it:
 * an entry per horse grouped by race name and day. Its state: still to come, run, or every horse withdrawn.
 */
function groupRaces(entries) {
  const today = dayjs().startOf('day');
  const groups = new Map();
  for (const e of entries) {
    const key = `${String(e.raceName || '').trim().toLowerCase()}|${dayjs(e.raceDate).format('YYYY-MM-DD')}`;
    if (!groups.has(key)) groups.set(key, { key, name: e.raceName, date: e.raceDate, venue: e.venue, distance: e.distance, surface: e.surface, entries: [] });
    const g = groups.get(key);
    g.entries.push(e);
    g.venue = g.venue || e.venue;
    g.distance = g.distance || e.distance;
    g.surface = g.surface || e.surface;
  }
  return [...groups.values()].map((g) => {
    const live = g.entries.filter((e) => e.status !== 'withdrawn');
    const state = !live.length ? 'withdrawn' : live.some((e) => e.status === 'completed') || dayjs(g.date).isBefore(today) ? 'done' : 'coming';
    return { ...g, state, live };
  });
}

/** One race in the list: its day, name and place, and a word on the owner's horses in it. */
function RaceRow({ race, active, onPick }) {
  const n = race.entries.length;
  let side;
  if (race.state === 'coming') {
    const confirmed = race.live.filter((e) => e.status === 'confirmed' && !e.reviewNeeded).length;
    side = <Pill tone={confirmed === race.live.length ? 'good' : 'watch'}>{confirmed === race.live.length ? 'Đã xác nhận' : `${race.live.length - confirmed} chờ HLV`}</Pill>;
  } else if (race.state === 'done') {
    const best = race.live.filter((e) => e.position).sort((a, b) => a.position - b.position)[0];
    side = best ? <Place position={best.position} /> : <Pill>Chưa có kết quả</Pill>;
  } else {
    side = <Pill>Đã rút</Pill>;
  }
  return (
    <button type="button" className={`own-rl-row${active ? ' is-active' : ''}`} onClick={() => onPick(race.key)} aria-pressed={active}>
      <span className="own-rl-date">
        <b>{dayjs(race.date).format('DD')}</b>
        <span>Th{dayjs(race.date).month() + 1}</span>
      </span>
      <span className="own-rl-main">
        <b>{race.name}</b>
        <span>
          {[WEEKDAY_SHORT[dayjs(race.date).day()], race.state === 'coming' ? countdown(race.date) : null, ...facts(race).slice(0, 1)].filter(Boolean).join(' · ')}
        </span>
        <span className="own-rl-horses">{n} ngựa của bạn</span>
      </span>
      <span className="own-rl-side">{side}</span>
    </button>
  );
}

/** A horse entered for the picked race: where it stands, or how it ran. */
function EntryRow({ entry, horse, trial, state }) {
  if (entry.status === 'withdrawn') {
    return (
      <div className="own-re">
        <div className="own-re-head">
          <HorseAvatar horse={horse} size={36} />
          <b className="own-re-name">{horse?.name || 'Ngựa'}</b>
          <Pill>Đã rút</Pill>
        </div>
        <div className="own-re-note">
          <b>{entry.decision?.auto ? 'Hệ thống tự rút' : 'HLV rút'}:</b> {entry.decision?.reason || 'không ghi lý do.'}
        </div>
      </div>
    );
  }
  if (state === 'done') {
    return (
      <div className="own-re">
        <div className="own-re-head">
          <HorseAvatar horse={horse} size={36} />
          <b className="own-re-name">{horse?.name || 'Ngựa'}</b>
          <Place position={entry.position} result={entry.result} />
        </div>
        <div className="own-re-figures">
          <span>
            Thời gian <b>{entry.finishTime || '—'}</b>
          </span>
          <span>
            Tiền thưởng <b className={entry.prizeMoney > 0 ? 'own-good' : ''}>{entry.prizeMoney > 0 ? money(entry.prizeMoney) : '—'}</b>
          </span>
        </div>
      </div>
    );
  }
  const d = decisionOf(entry);
  const t = trialOf(trial);
  const steps = [
    { label: 'Đăng ký', value: entry.createdAt ? fmtDate(entry.createdAt) : 'Đã đăng ký', state: 'done' },
    { label: 'Chạy thử', value: t.label, state: t.state },
    { label: 'HLV quyết định', value: entry.reviewNeeded ? 'Đang xem lại' : entry.status === 'confirmed' ? 'Tham gia' : 'Đang chờ', state: entry.reviewNeeded ? 'bad' : entry.status === 'confirmed' ? 'done' : 'current' },
    { label: 'Ngày đua', value: fmtDate(entry.raceDate), state: daysTo(entry.raceDate) === 0 ? 'current' : 'todo' },
  ];
  return (
    <div className="own-re">
      <div className="own-re-head">
        <HorseAvatar horse={horse} size={36} />
        <b className="own-re-name">{horse?.name || 'Ngựa'}</b>
        <Pill tone={d.tone}>{d.label}</Pill>
      </div>
      <ol className="own-race-steps is-small" aria-label={`Lộ trình dự giải của ${horse?.name || 'ngựa'}`}>
        {steps.map((s, i) => (
          <li key={s.label} className={`is-${s.state}`}>
            <span className="own-race-step-dot">{s.state === 'done' ? <CheckOutlined /> : i + 1}</span>
            <span className="own-race-step-label">{s.label}</span>
            <span className="own-race-step-value">{s.value}</span>
          </li>
        ))}
      </ol>
      {entry.reviewNeeded && <div className="own-re-note is-bad">Sức khỏe của ngựa đã thay đổi sau khi được xác nhận — HLV sẽ quyết định lại.</div>}
      {entry.status === 'confirmed' && entry.decision?.reason && <div className="own-re-note">HLV ghi: {entry.decision.reason}</div>}
    </div>
  );
}

/**
 * The races of the owner's horses (or of one horse, `horseId`), race first: the list of races — to come,
 * run, withdrawn — and the picked race in full: when and where, how long until it, and the owner's horses
 * in it, each with the road to the race (entered, trial, the trainer's decision) or how it ran.
 */
export default function RaceDetail({ horses, horseId = null }) {
  const { races: entries, isLoading } = useRaces();
  const { sessions } = useSessions();
  const [tab, setTab] = useState('coming');
  const [picked, setPicked] = useState(null);
  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  const horseOf = (e) => horsesById.get(idOf(e.horse)) || e.horse;

  const mine = useMemo(() => {
    const ids = new Set(horseId ? [String(horseId)] : horsesById.keys());
    return entries.filter((r) => ids.has(idOf(r.horse)));
  }, [entries, horseId, horsesById]);
  const groups = useMemo(() => groupRaces(mine), [mine]);
  const lists = {
    coming: groups.filter((g) => g.state === 'coming').sort((a, b) => new Date(a.date) - new Date(b.date)),
    done: groups.filter((g) => g.state === 'done').sort((a, b) => new Date(b.date) - new Date(a.date)),
    withdrawn: groups.filter((g) => g.state === 'withdrawn').sort((a, b) => new Date(b.date) - new Date(a.date)),
  };
  const list = lists[tab];
  const race = list.find((g) => g.key === picked) || list[0] || null;
  // A new tab opens on its first race.
  useEffect(() => setPicked(null), [tab]);

  const results = mine.filter((r) => r.status === 'completed');
  const wins = results.filter((r) => r.position === 1).length;
  const podiums = results.filter((r) => r.position && r.position <= 3).length;
  const prize = results.reduce((t, r) => t + (r.prizeMoney || 0), 0);
  const trialFor = (e) =>
    sessions.filter((s) => idOf(s.raceEntry) === idOf(e) && s.status !== 'cancelled').sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt))[0] || null;
  const n = race ? daysTo(race.date) : null;

  return (
    <div className="flex flex-col gap-4">
      <Stats
        items={[
          { label: 'Giải sắp tới', icon: <CalendarOutlined />, value: lists.coming.length, sub: lists.coming[0] ? `Gần nhất ${fmtDate(lists.coming[0].date)}` : 'Chưa đăng ký giải nào' },
          { label: 'Đã thi đấu', icon: <FlagOutlined />, value: results.length, sub: results.length ? `${podiums} lần vào top 3` : 'Chưa có kết quả' },
          { label: 'Về nhất', icon: <TrophyOutlined />, value: wins, tone: wins ? 'good' : undefined, sub: results.length ? `${Math.round((wins / results.length) * 100)}% số lần thi đấu` : '—' },
          { label: 'Tiền thưởng', icon: <DollarOutlined />, value: money(prize), sub: 'Tự ghi vào sổ thu chi' },
        ]}
      />

      <div className="own-rl-layout">
        <Card
          className="own-rl-list"
          flush
          title={
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'coming', label: `Sắp tới (${lists.coming.length})` },
                { value: 'done', label: `Đã đua (${lists.done.length})` },
                { value: 'withdrawn', label: `Đã rút (${lists.withdrawn.length})` },
              ]}
            />
          }
        >
          {list.length === 0 ? (
            <EmptyNote>{isLoading ? 'Đang tải…' : tab === 'coming' ? 'Chưa có giải nào sắp tới. HLV đăng ký giải khi ngựa sẵn sàng.' : tab === 'done' ? 'Chưa thi đấu giải nào.' : 'Chưa rút khỏi giải nào.'}</EmptyNote>
          ) : (
            <div className="own-rl">
              {list.map((g) => (
                <RaceRow key={g.key} race={g} active={race?.key === g.key} onPick={setPicked} />
              ))}
            </div>
          )}
        </Card>

        {race ? (
          <section className="own-card own-rd" aria-label={race.name}>
            <header className="own-rd-head">
              <div className="own-rd-count">
                {race.state === 'coming' ? (
                  <>
                    <span className="own-rd-count-n">{n <= 0 ? 'Hôm nay' : n}</span>
                    {n > 0 && <span>ngày nữa</span>}
                  </>
                ) : (
                  <>
                    <span className="own-rd-count-n">{dayjs(race.date).format('DD/MM')}</span>
                    <span>{dayjs(race.date).format('YYYY')}</span>
                  </>
                )}
              </div>
              <div className="min-w-0">
                <div className="own-race-eyebrow">
                  <FlagOutlined /> {race.state === 'coming' ? 'Giải sắp tới' : race.state === 'done' ? 'Đã thi đấu' : 'Đã rút'}
                </div>
                <h2 className="own-race-name">{race.name}</h2>
                <div className="own-rd-facts">
                  <span>
                    <CalendarOutlined /> {WEEKDAY_FULL[dayjs(race.date).day()]} · {dayjs(race.date).format('DD/MM/YYYY')}
                  </span>
                  {race.venue && (
                    <span>
                      <EnvironmentOutlined /> {race.venue}
                    </span>
                  )}
                  {race.distance && <span>{race.distance.toLocaleString('vi-VN')} m</span>}
                  {SURFACE_LABELS[race.surface] && <span>{SURFACE_LABELS[race.surface]}</span>}
                </div>
              </div>
            </header>
            <div className="own-rd-body">
              <div className="own-rd-sub">
                Ngựa của bạn trong giải này <span className="own-faint">({race.entries.length})</span>
              </div>
              {race.entries
                .slice()
                .sort((a, b) => (a.status === 'withdrawn') - (b.status === 'withdrawn') || (a.position || 99) - (b.position || 99))
                .map((e) => (
                  <EntryRow key={e._id} entry={e} horse={horseOf(e)} trial={trialFor(e)} state={race.state} />
                ))}
              {race.state === 'coming' && <div className="own-faint text-xs">HLV quyết định cho ngựa tham gia hay rút, thường dựa trên buổi chạy thử trước giải. Bạn được báo ngay khi có quyết định.</div>}
            </div>
          </section>
        ) : (
          <Card>
            <EmptyNote>Chọn một giải để xem ngựa của bạn trong giải đó.</EmptyNote>
          </Card>
        )}
      </div>
    </div>
  );
}
