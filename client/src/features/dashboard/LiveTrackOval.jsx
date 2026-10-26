import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../../lib/socket';
import { SESSION_KINDS, OBJECTIVE_LABELS, sessionTargets } from '../training/trainingVocab';
import { coatFor } from '../horses/horse3d/horseBreeds';

// The oval, in the SVG's own units: two straights joined by two bends, run anticlockwise from the
// finish line on the home straight (bottom right), one lap for any session's course.
const STRAIGHT = { from: 100, to: 300 };
const RADIUS = 70;
const MID_Y = 100;
const FINISH_X = 270;
const LAP = `M ${FINISH_X} ${MID_Y + RADIUS} L ${STRAIGHT.to} ${MID_Y + RADIUS} A ${RADIUS} ${RADIUS} 0 0 0 ${STRAIGHT.to} ${MID_Y - RADIUS} L ${STRAIGHT.from} ${MID_Y - RADIUS} A ${RADIUS} ${RADIUS} 0 0 0 ${STRAIGHT.from} ${MID_Y + RADIUS} Z`;
const LANE = 9; // horses run side by side this far apart, inside the 26-wide track
const NEAR = 0.05; // horses closer than this share of the lap have their names stacked
const BEND = Math.PI * RADIUS;
const LAP_LENGTH = 2 * (STRAIGHT.to - STRAIGHT.from) + 2 * BEND;

/** The point of the lap at a share of it (0 = 1 = the finish line). */
function pointAt(share) {
  let d = (((share % 1) + 1) % 1) * LAP_LENGTH;
  const bottom = MID_Y + RADIUS;
  if (d < STRAIGHT.to - FINISH_X) return { x: FINISH_X + d, y: bottom };
  d -= STRAIGHT.to - FINISH_X;
  if (d < BEND) {
    const a = Math.PI / 2 - d / RADIUS;
    return { x: STRAIGHT.to + RADIUS * Math.cos(a), y: MID_Y + RADIUS * Math.sin(a) };
  }
  d -= BEND;
  if (d < STRAIGHT.to - STRAIGHT.from) return { x: STRAIGHT.to - d, y: MID_Y - RADIUS };
  d -= STRAIGHT.to - STRAIGHT.from;
  if (d < BEND) {
    const a = -Math.PI / 2 - d / RADIUS;
    return { x: STRAIGHT.from + RADIUS * Math.cos(a), y: MID_Y + RADIUS * Math.sin(a) };
  }
  return { x: STRAIGHT.from + d - BEND, y: bottom };
}

/** Away from the infield at a point of the track: from the nearest point of the line between the bends' centres. */
function outward(x, y) {
  const cx = Math.min(STRAIGHT.to, Math.max(STRAIGHT.from, x));
  const len = Math.hypot(x - cx, y - MID_Y) || 1;
  return [(x - cx) / len, (y - MID_Y) / len];
}

/**
 * A horse's dot at a share of its course, in its lane, and where its name goes: in the infield (never
 * cut off at the edge), `stack` lines further in when other horses are close by.
 */
function place(share, lane, stack) {
  const p = pointAt(Math.min(0.9999, share));
  const [ox, oy] = outward(p.x, p.y);
  const inward = 24 + stack * 13;
  return { x: p.x + ox * lane * LANE, y: p.y + oy * lane * LANE, lx: p.x - ox * inward, ly: p.y - oy * inward + 4, anchor: ox > 0.5 ? 'end' : ox < -0.5 ? 'start' : 'middle' };
}

/**
 * The Head Trainer's dashboard while horses are out: every running session on one oval, the horse a
 * dot in its own coat placed by the share of its course run so far (from the live sensor feed), with
 * its figures beside. Shown only while something runs; the full monitor is on the sessions page.
 */
export default function LiveTrackOval({ sessions = [], horses = [] }) {
  const running = sessions.filter((s) => s.status === 'in_progress');
  const queryClient = useQueryClient();
  // The latest reading per session from the feed: { distance, targetDistance, speed, hr }.
  const [live, setLive] = useState({});
  // Where each dot is drawn (share of the lap), easing towards where the feed says it is; straight
  // there when the system asks for less motion.
  const [shown, setShown] = useState({});
  const shownNow = useRef({});
  const [still] = useState(() => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));

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
  const rows = running.map((s) => {
    const r = live[String(s._id)] || {};
    const target = sessionTargets(s);
    const distance = r.distance ?? s.metrics?.distance ?? 0;
    const course = r.targetDistance || target.distance;
    const hr = r.hr ?? s.metrics?.lastHeartRate;
    return {
      s,
      horse: horseById.get(String(s.horse?._id || s.horse)),
      share: course ? Math.min(1, distance / course) : 0,
      distance,
      course,
      speed: r.speed ?? s.metrics?.lastSpeed,
      hr,
      over: hr != null && hr > target.heartRateMax,
    };
  });
  const targets = rows.map((x) => `${x.s._id}:${x.share.toFixed(4)}`).join(',');

  // Each dot glides along the track to its new place over about four seconds (a reading comes every
  // five), so it never cuts across a bend.
  useEffect(() => {
    if (!targets || still) return undefined;
    const goal = Object.fromEntries(targets.split(',').map((t) => [t.split(':')[0], Number(t.split(':')[1])]));
    let raf = 0;
    let last = null;
    const step = (now) => {
      const dt = last == null ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      let moving = false;
      const next = {};
      for (const [id, to] of Object.entries(goal)) {
        const from = shownNow.current[id] ?? to;
        const gap = to - from;
        next[id] = Math.abs(gap) < 0.0005 ? to : from + gap * Math.min(1, dt * 0.8);
        if (next[id] !== to) moving = true;
      }
      shownNow.current = next;
      setShown(next);
      if (moving) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [targets, still]);

  if (!running.length) return null;
  // How many horses listed before each one are close to it on the lap: its name goes that many lines in.
  const stacks = rows.map((x, i) => rows.slice(0, i).filter((y) => Math.abs(y.share - x.share) < NEAR).length);

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] rounded-xl"
      styles={{ title: { whiteSpace: 'normal' } }}
      title={<span className="font-semibold text-gray-900 text-[15px]">Đang tập: {running.length} ngựa</span>}
      extra={
        <Link to="/training/sessions">
          <Button size="small">Theo dõi chi tiết</Button>
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <svg viewBox="0 0 400 200" className="w-full md:col-span-3" role="img" aria-label={`Vị trí ${running.length} ngựa đang tập trên vòng sân, theo phần cự ly đã chạy`}>
          <path d={LAP} fill="#EAF2E6" stroke="#D8C8A2" strokeWidth={26} strokeLinejoin="round" />
          <path d={LAP} fill="none" stroke="#FFFFFF" strokeWidth={1} strokeDasharray="3 5" />
          {/* The finish line, where every course starts and ends. */}
          <line x1={FINISH_X} y1={MID_Y + RADIUS - 13} x2={FINISH_X} y2={MID_Y + RADIUS + 13} stroke="#1F2937" strokeWidth={2} />
          <text x={FINISH_X} y={MID_Y + RADIUS + 26} textAnchor="middle" fontSize={10} fill="#6B7280">
            Đích
          </text>
          {rows.map((x, i) => {
            const pt = place(still ? x.share : (shown[String(x.s._id)] ?? x.share), i - (rows.length - 1) / 2, stacks[i]);
            const coat = coatFor({ breed: x.horse?.breed, color: x.horse?.color });
            return (
              <g key={x.s._id}>
                <circle cx={pt.x} cy={pt.y} r={6} fill={coat.swatch} stroke={x.over ? '#DC2626' : '#FFFFFF'} strokeWidth={2} />
                <text x={pt.lx} y={pt.ly} textAnchor={pt.anchor} fontSize={12} fontWeight={600} fill={x.over ? '#B91C1C' : '#1F2937'}>
                  {x.s.horse?.name}
                </text>
              </g>
            );
          })}
        </svg>
        <ul className="m-0 list-none divide-y divide-gray-100 p-0 md:col-span-2">
          {rows.map((x) => (
            <li key={x.s._id} className="py-2 first:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <Link to={`/training/sessions?horse=${x.s.horse?._id || x.s.horse}`} className="truncate font-semibold text-gray-900">
                  {x.s.horse?.name}
                </Link>
                <span className="shrink-0 text-xs text-gray-500">{SESSION_KINDS[x.s.kind]?.label || OBJECTIVE_LABELS[x.s.objective] || 'Buổi tập'}</span>
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
      </div>
    </Card>
  );
}
