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
export default function TrainingTrackCard({ sessions = [], horses = [] }) {
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

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] rounded-xl"
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Track3D runners={runners} focus={focus} label={label} height="clamp(260px, 27vw, 380px)" className="lg:col-span-2" />

        <div className="min-w-0 space-y-4 text-sm">
          {rows.length > 0 && (
            <section>
              <div className="mb-1 text-xs font-semibold text-gray-500">Đang chạy</div>
              <ul className="m-0 list-none divide-y divide-gray-100 p-0">
                {rows.map((x) => (
                  <li key={x.s._id} className="py-1.5" onMouseEnter={() => setFocus(x.id)} onMouseLeave={() => setFocus(null)}>
                    <div className="flex items-baseline justify-between gap-2">
                      <Link to={`/training/sessions?horse=${x.id}`} className="truncate font-semibold" onFocus={() => setFocus(x.id)} onBlur={() => setFocus(null)}>
                        {x.s.horse?.name}
                      </Link>
                      <span className="shrink-0 text-xs text-gray-500">{kindOf(x.s)}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-xs tabular-nums text-gray-600">
                      <span>
                        {Math.round(x.distance).toLocaleString('vi-VN')} / {Math.round(x.course).toLocaleString('vi-VN')} m
                      </span>
                      <span>{x.speed != null ? `${x.speed} km/h` : 'chờ cảm biến'}</span>
                      <span className={x.over ? 'font-semibold text-rose-700' : ''}>{x.hr != null ? `${x.hr} bpm` : ''}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="mb-1 text-xs font-semibold text-gray-500">Còn lại hôm nay</div>
            {waiting.length ? (
              <ul className="m-0 list-none divide-y divide-gray-100 p-0">
                {nextShown.map((s) => (
                  <li key={s._id} className="flex items-center gap-2 py-1.5" onMouseEnter={() => setFocus(horseId(s))} onMouseLeave={() => setFocus(null)}>
                    <span className="w-11 shrink-0 tabular-nums text-gray-500">{hhmm(s.scheduledAt)}</span>
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
          </section>

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
        </div>
      </div>
    </Card>
  );
}
