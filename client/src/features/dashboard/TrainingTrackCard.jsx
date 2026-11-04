import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Grid, Tag } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getSocket } from '../../lib/socket';
import { SESSION_KINDS, OBJECTIVE_LABELS, DONE_STATUSES, sessionTargets } from '../training/trainingVocab';
import { SESSION_STATUS_COLORS, SESSION_STATUS_LABELS } from '../training/sessionStatus';
import { coatFor } from '../horses/horse3d/horseBreeds';
import Track3D from './track3d/Track3D';

const WAITING = ['scheduled', 'ready', 'blocked'];
const hhmm = (d) => dayjs(d).format('HH:mm');
const kindOf = (s) => SESSION_KINDS[s.kind]?.short || OBJECTIVE_LABELS[s.objective] || 'Buổi tập';
const horseId = (s) => String(s.horse?._id || s.horse);

/**
 * The Head Trainer's track today, in 3D: every running session's horse goes round the oval at the share
 * of its course run so far (from the live sensor feed), in its own coat and at the gait of its speed; the
 * horses booked today and not out wait by the finish post. Beside it, the running horses' figures, the
 * sessions still to come today and how the day has gone. The full monitor is on the sessions page.
 */
export default function TrainingTrackCard({ sessions = [], horses = [], compact = false, onTrack = false, loading = false }) {
  const queryClient = useQueryClient();
  const screens = Grid.useBreakpoint();
  // The latest reading per session from the feed: { distance, targetDistance, speed, hr }.
  const [live, setLive] = useState({});
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    if (!socket.connected) socket.connect();
    const onReading = (r) => setLive((prev) => ({ ...prev, [String(r.sessionId)]: { distance: r.distance, targetDistance: r.targetDistance, speed: r.speed, hr: r.heartRate } }));
    const onCompleted = () => queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
    socket.on('sensor:reading', onReading);
    socket.on('session:completed', onCompleted);
    return () => {
      socket.off('sensor:reading', onReading);
      socket.off('session:completed', onCompleted);
    };
  }, [queryClient]);

  const horseById = new Map(horses.map((h) => [String(h._id), h]));
  const coatOf = (id) => coatFor({ breed: horseById.get(id)?.breed, color: horseById.get(id)?.color });
  const running = sessions.filter((s) => s.status === 'in_progress');
  const rows = running.map((s) => {
    const r = live[String(s._id)] || {};
    const target = sessionTargets(s);
    const distance = r.distance ?? s.metrics?.distance ?? 0;
    const course = r.targetDistance || target.distance;
    const hr = r.hr ?? s.metrics?.lastHeartRate;
    return {
      s,
      id: horseId(s),
      share: course ? Math.min(1, distance / course) : 0,
      distance,
      course,
      speed: r.speed ?? s.metrics?.lastSpeed,
      hr,
      over: hr != null && hr > target.heartRateMax,
    };
  });

  const today = sessions.filter((s) => s.scheduledAt && dayjs(s.scheduledAt).isSame(dayjs(), 'day') && s.status !== 'cancelled');
  const waiting = today.filter((s) => WAITING.includes(s.status)).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const done = today.filter((s) => DONE_STATUSES.includes(s.status) || s.status === 'aborted');
  const met = done.filter((s) => s.outcome?.met).length;
  const missed = today.filter((s) => s.status === 'missed').length;

  // On the track: the running horses. By the finish post: today's other horses, the next to go out first;
  // on a day with nothing booked, the trainer's horses, so the oval is never empty.
  const out = new Set(rows.map((x) => x.id));
  const parked = [];
  const park = (id, name, note) => {
    if (out.has(id) || parked.some((p) => p.id === id)) return;
    parked.push({ id, name, note, coat: coatOf(id) });
  };
  // Short notes: the names of horses standing side by side must not run into each other; the list beside has the rest.
  for (const s of waiting) park(horseId(s), s.horse?.name, hhmm(s.scheduledAt));
  for (const s of done) park(horseId(s), s.horse?.name, 'Đã tập');
  if (!today.length) for (const h of horses.filter((x) => x.healthStatus === 'eligible').slice(0, 8)) park(String(h._id), h.name, 'Chưa có lịch');
  const runners = [
    ...rows.map((x) => ({
      id: x.id,
      name: x.s.horse?.name,
      coat: coatOf(x.id),
      note: [x.speed != null ? `${Math.round(x.speed)} km/h` : 'chờ cảm biến', x.hr != null ? `${x.hr} bpm` : null].filter(Boolean).join(', '),
      over: x.over,
      share: x.share,
      kmh: x.speed ?? 0,
    })),
    ...parked,
  ];
  const label = rows.length
    ? `Sân tập 3D: ${rows.length} ngựa đang chạy, đặt theo phần cự ly đã chạy; ${parked.length} ngựa đứng chờ cạnh cột đích`
    : `Sân tập 3D: không có ngựa nào đang chạy; ${parked.length} ngựa đứng cạnh cột đích`;
  const [nextShown, rest] = [waiting.slice(0, 5), waiting.length - 5];

  if (onTrack) {
    const next = waiting[0];
    const left = next ? Math.max(0, dayjs(next.scheduledAt).diff(dayjs(), 'minute')) : 0;
    const summary = [done.length ? `Đã tập ${done.length} buổi, đạt ${met}` : null, missed ? `Lỡ giờ ${missed} buổi` : null, waiting.length ? `Còn ${waiting.length} buổi hôm nay` : null].filter(Boolean).join('. ');
    const instruments = rows.length
      ? rows.slice(0, 2).map((x) => (
          <section key={x.s._id} className="st-live-section pointer-events-auto" onMouseEnter={() => setFocus(x.id)} onMouseLeave={() => setFocus(null)}>
            <div className="grid items-center gap-x-5 gap-y-2 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-gray-700">
                  <span className={`inline-block h-2 w-2 rounded-full animate-pulse ${x.over ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                  <span>{kindOf(x.s)}</span>
                </div>
                <Link to={`/training/sessions?horse=${x.id}`} className="block truncate text-[15px] font-semibold">
                  {x.s.horse?.name}
                </Link>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label={`Cự ly đã chạy của ${x.s.horse?.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(x.share * 100)}>
                  <div className={`h-full rounded-full transition-all ${x.over ? 'bg-rose-400' : 'bg-emerald-400'}`} style={{ width: `${Math.round(x.share * 100)}%` }} />
                </div>
              </div>
              <dl className="st-live-figures">
                <div><dt>Tốc độ</dt><dd>{x.speed != null ? x.speed : '—'}<small> km/h</small></dd></div>
                <div className={x.over ? 'st-live-warning' : undefined}><dt>Nhịp tim</dt><dd>{x.hr != null ? x.hr : '—'}<small> bpm</small></dd></div>
                <div><dt>Cự ly</dt><dd>{Math.round(x.distance).toLocaleString('vi-VN')}<small> / {Math.round(x.course).toLocaleString('vi-VN')} m</small></dd></div>
              </dl>
            </div>
            {x.over && <p className="st-live-warning-note">Nhịp tim vượt ngưỡng bài tập</p>}
          </section>
        ))
      : (
          <div className="st-next-up pointer-events-auto">
            {next ? (
              <Link to={`/training/sessions?horse=${horseId(next)}`} className="min-w-0 font-medium">
                Buổi kế tiếp <span className="st-figure font-bold text-[#FDE047]">{hhmm(next.scheduledAt)}</span> <strong>{next.horse?.name}</strong> · {kindOf(next).toLowerCase()} (còn {left >= 60 ? `${Math.floor(left / 60)} giờ ` : ''}{left % 60} phút)
              </Link>
            ) : (
              <span>{loading ? 'Đang tải lịch hôm nay…' : today.length ? 'Không còn buổi nào chờ chạy.' : 'Hôm nay chưa có buổi tập nào.'}</span>
            )}
            {summary && <small className="tabular-nums shrink-0 rounded bg-white/10 px-2 py-0.5 text-xs font-medium">{summary}</small>}
          </div>
        );
    return (
      <Card
        className="!overflow-hidden h-full flex flex-col"
        styles={{ body: { padding: 0, flex: 1, display: 'flex', flexDirection: 'column' }, title: { whiteSpace: 'normal' } }}
        title={
          <span>
            <span>Sân tập hôm nay</span>
            <span className="ml-2 text-xs font-normal text-gray-500">{rows.length ? `${rows.length} ngựa đang chạy, vị trí theo cảm biến` : 'không có ngựa nào đang chạy'}</span>
          </span>
        }
        extra={screens.md && <Link to="/training/sessions"><Button size="small">Theo dõi chi tiết</Button></Link>}
      >
        <Track3D runners={runners} focus={focus} label={label} height={screens.md ? '100%' : '280px'} className="flex-1 flex flex-col min-h-[420px]" frameClassName="rounded-none flex-1" hint={false}>
          {screens.md && <div className="pointer-events-none absolute bottom-3 left-3 right-11 flex flex-col gap-2">{instruments}</div>}
        </Track3D>
        {!screens.md && <div className="flex flex-col gap-2 bg-[#0F1211] p-3">{instruments}</div>}
      </Card>
    );
  }

  return (
    <Card
      className="light-surface-box shadow-xs border-[#E5DEC9] rounded-xl"
      styles={{ title: { whiteSpace: 'normal' }, body: { padding: 12 } }}
      title={
        <div className="py-1">
          <span className="font-semibold text-gray-900 text-[15px]">Sân tập hôm nay</span>
          <p className="m-0 mt-0.5 text-xs font-normal text-gray-600">
            {rows.length ? `${rows.length} ngựa đang chạy, vị trí theo cảm biến` : 'Không có ngựa nào đang chạy'}
          </p>
        </div>
      }
      // On a phone the link goes under the lists, so the title keeps its line.
      extra={
        screens.md && (
          <Link to="/training/sessions">
            <Button size="small">Theo dõi chi tiết</Button>
          </Link>
        )
      }
    >
      <div className={compact ? 'grid min-w-0 grid-cols-1 gap-3' : 'grid grid-cols-1 gap-4 lg:grid-cols-3'}>
        <Track3D runners={runners} focus={focus} label={label} height={compact ? 'clamp(260px, 23vw, 340px)' : 'clamp(260px, 27vw, 380px)'} className={compact ? '' : 'lg:col-span-2'} />

        {(rows.length > 0 || !compact || done.length > 0 || missed > 0 || !screens.md) && <div className="light-surface-box min-w-0 space-y-4 rounded-xl border border-[#E5DEC9] bg-[#FAF7F0] p-3 text-sm">
          {rows.length > 0 && (
            <section className="st-live-section">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                <span className={`inline-block h-2 w-2 rounded-full animate-pulse ${rows.some((r) => r.over) ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                <span>Đang chạy</span>
              </div>
              <ul className="m-0 list-none divide-y divide-gray-100 p-0">
                {rows.map((x) => (
                  <li key={x.s._id} className="py-2" onMouseEnter={() => setFocus(x.id)} onMouseLeave={() => setFocus(null)}>
                    <div className="flex items-baseline justify-between gap-2">
                      <Link to={`/training/sessions?horse=${x.id}`} className="truncate font-semibold" onFocus={() => setFocus(x.id)} onBlur={() => setFocus(null)}>
                        {x.s.horse?.name}
                      </Link>
                      <span className="shrink-0 text-xs text-gray-500">{kindOf(x.s)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-label={`Cự ly đã chạy của ${x.s.horse?.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(x.share * 100)}>
                      <div
                        className={`h-full rounded-full transition-all ${x.over ? 'bg-rose-500' : 'bg-[#0F5A43]'}`}
                        style={{ width: `${Math.round(x.share * 100)}%` }}
                      />
                    </div>
                    <dl className="st-live-figures">
                      <div><dt>Tốc độ</dt><dd>{x.speed != null ? x.speed : '—'}<small>km/h</small></dd></div>
                      <div className={x.over ? 'st-live-warning' : undefined}><dt>Nhịp tim</dt><dd>{x.hr != null ? x.hr : '—'}<small>bpm</small></dd></div>
                      <div><dt>Cự ly</dt><dd>{Math.round(x.distance).toLocaleString('vi-VN')}<small>/ {Math.round(x.course).toLocaleString('vi-VN')} m</small></dd></div>
                    </dl>
                    {x.over && <p className="st-live-warning-note">Nhịp tim vượt ngưỡng bài tập</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!compact && <section>
            <div className="mb-1.5 text-xs font-semibold text-gray-700">Còn lại hôm nay</div>
            {waiting.length ? (
              <ul className="m-0 list-none divide-y divide-gray-100 p-0">
                {nextShown.map((s) => (
                  <li key={s._id} className="flex items-center gap-2 py-1.5" onMouseEnter={() => setFocus(horseId(s))} onMouseLeave={() => setFocus(null)}>
                    <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-xs font-semibold tabular-nums text-gray-700 border border-[#E5DEC9]">
                      {hhmm(s.scheduledAt)}
                    </span>
                    <Link to={`/training/sessions?horse=${horseId(s)}`} className="min-w-0 flex-1 truncate font-medium" onFocus={() => setFocus(horseId(s))} onBlur={() => setFocus(null)}>
                      {s.horse?.name}
                    </Link>
                    <span className="shrink-0 text-xs text-gray-500">{kindOf(s)}</span>
                    {s.status !== 'scheduled' && (
                      <Tag color={SESSION_STATUS_COLORS[s.status]} className="!m-0 shrink-0 !text-[11px]">
                        {SESSION_STATUS_LABELS[s.status]}
                      </Tag>
                    )}
                  </li>
                ))}
                {rest > 0 && (
                  <li className="pt-1.5 text-xs">
                    <Link to="/training/sessions">Thêm {rest} buổi nữa</Link>
                  </li>
                )}
              </ul>
            ) : (
              <p className="m-0 text-xs text-gray-600">
                {today.length ? 'Không còn buổi nào chờ chạy.' : 'Hôm nay chưa có buổi tập nào.'}
                {!today.length && (
                  <Link to="/training/sessions?new=1" className="ml-1">
                    Xếp lịch tập
                  </Link>
                )}
              </p>
            )}
          </section>}

          {(done.length > 0 || missed > 0) && (
            <p className="m-0 border-t border-gray-100 pt-2 text-xs tabular-nums text-gray-600">
              {[done.length ? `Đã tập ${done.length} buổi, đạt mục tiêu ${met}` : null, missed ? `Lỡ giờ ${missed} buổi` : null].filter(Boolean).join('. ')}
            </p>
          )}
          {!screens.md && (
            <Link to="/training/sessions" className="block text-xs">
              Theo dõi chi tiết các buổi đang chạy
            </Link>
          )}
        </div>}
      </div>
    </Card>
  );
}
