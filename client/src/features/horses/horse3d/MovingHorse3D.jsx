import { useEffect, useRef, useState } from 'react';
import { Button, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { coatFor } from './horseBreeds';
import { MOVING_HORSE, PASTURE_CREDIT } from './horseMotion';

const GLASS = { background: 'rgba(1,17,12,.62)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(6px)' };
const TONES = { alert: '#fca5a5', warn: '#fde68a' };
const SURFACE_WORDS = { turf: 'mặt cỏ', dirt: 'mặt đất', sand: 'mặt cát', synthetic: 'mặt tổng hợp', pasture: 'đồng cỏ' };

/** The time in Vietnam now and the part of the day it is in, as the pasture's sky shows it: "Chiều, 17:32". */
function vietnamClock() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  const h = d.getUTCHours();
  const part = h < 5 ? 'Đêm' : h < 11 ? 'Sáng' : h < 13 ? 'Trưa' : h < 18 ? 'Chiều' : h < 22 ? 'Tối' : 'Đêm';
  return `${part}, ${String(h).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * A horse in 3D doing something — walking, trotting, galloping, lame, pulled up, grazing, resting —
 * `motion` from horseMotion.js, on the track `surface` its plan trains on (turf, dirt, sand,
 * synthetic). It wears its own coat (breed / colour on record). The stage itself is horseStage.js
 * (three.js), loaded with this component so pages without a horse don't carry it.
 *
 * `view`: 'side' (side on, the track streams by, drag to look around) or 'turntable' (turns by itself).
 * `hour`: the hour of the day (Vietnam, hourOf) whose sky the track shows — a session's; without
 * it the pasture shows the sky of now and a track a plain one.
 * `creditInFrame`: the models' authors (their CC BY licence asks for them) behind an "i" in the
 * frame's corner instead of in two lines under it.
 * `fill`: the frame grows to the height of its parent (a grid cell beside a taller card), `height`
 * being its least.
 */
export default function MovingHorse3D({ breed, color, motion, surface = 'dirt', hour = null, height = 260, view = 'side', compact = false, showCoat = false, creditInFrame = false, fill = false, className = '' }) {
  const canvas = useRef(null);
  const box = useRef(null);
  const stage = useRef(null);
  const [status, setStatus] = useState('loading');
  // The pasture's sky follows the clock in Vietnam (horseStage.js): its corner says what time it is.
  const realTime = surface === 'pasture' && hour == null;
  const [clock, setClock] = useState(vietnamClock);
  useEffect(() => {
    if (!realTime) return undefined;
    const timer = setInterval(() => setClock(vietnamClock()), 30000);
    return () => clearInterval(timer);
  }, [realTime]);
  const coat = coatFor({ breed, color });
  const latest = useRef({ coat, motion, surface, hour });
  latest.current = { coat, motion, surface, hour };

  useEffect(() => {
    let alive = true;
    let observer = null;
    import('./horseStage')
      // The stage's own file did not load: after a deploy, a page opened before it asks for a file of the
      // old build (main.jsx reloads the page once; past that the frame says so and offers a reload).
      .catch(() => {
        if (alive) setStatus('stale');
        return null;
      })
      .then((mod) => {
        if (!mod?.createHorseStage || !alive || !canvas.current) return;
        const s = mod.createHorseStage(canvas.current, { view });
        stage.current = s;
        const { coat: c, motion: m, surface: f, hour: h } = latest.current;
        s.setHour(h);
        s.setSurface(f);
        s.setCoat(c);
        s.setMotion(m);
        observer = new ResizeObserver(([entry]) => s.resize(entry.contentRect.width, entry.contentRect.height));
        observer.observe(box.current);
        s.ready.then(() => alive && setStatus('ready')).catch(() => alive && setStatus('error'));
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
      observer?.disconnect();
      stage.current?.dispose();
      stage.current = null;
    };
  }, [view]);

  useEffect(() => {
    stage.current?.setCoat(coat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coat.key, status]);
  useEffect(() => {
    stage.current?.setSurface(surface);
  }, [surface, status]);
  // To the quarter hour: a running session's clock does not repaint the sky every render.
  const quarter = hour == null ? null : Math.floor(hour * 4) / 4;
  useEffect(() => {
    stage.current?.setHour(quarter);
  }, [quarter, status]);
  // A new motion object each render: changed only when what it says changes.
  const motionKey = JSON.stringify(motion || {});
  useEffect(() => {
    stage.current?.setMotion(latest.current.motion);
  }, [motionKey, status]);

  const kmh = motion?.kmh || 0;
  const caption = motion?.label;

  return (
    <div className={`${fill ? "flex h-full flex-col" : ""} ${className}`}>
      <div ref={box} className={`@container relative overflow-hidden rounded-xl select-none bg-[#9fbfcf] ${fill ? "flex-1" : ""}`} style={fill ? { minHeight: height } : { height }}>
        <canvas
          ref={canvas}
          aria-label={`Ngựa 3D — ${caption || 'đứng yên'}${view === 'side' ? `, trên ${SURFACE_WORDS[surface] || 'mặt đất'}` : ''}`}
          className="absolute inset-0 block h-full w-full"
          style={{ opacity: status === 'ready' ? 1 : 0, transition: 'opacity .4s ease', touchAction: 'pan-y' }}
        />

        {caption && status === 'ready' && (
          <div className={`absolute pointer-events-none ${compact ? 'left-2 top-2' : 'left-3 top-3'}`}>
            <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold" style={{ ...GLASS, fontSize: compact ? 10 : 12, color: TONES[motion?.tone] || '#fff' }}>
              {caption}
              {kmh > 0 && <span className="font-normal opacity-80 tabular-nums">· {Math.round(kmh)} km/h</span>}
            </div>
          </div>
        )}
        {/* Not on a frame narrower than 300 px (a phone), where it would run into the caption. */}
        {realTime && status === 'ready' && (
          <div className={`@max-[300px]:hidden absolute pointer-events-none rounded-full px-2.5 py-1 tabular-nums text-white ${compact ? "right-2 top-2" : "right-3 top-3"}`} style={{ ...GLASS, fontSize: compact ? 10 : 11 }} title="Trời theo giờ thực ở Việt Nam">
            {clock}
          </div>
        )}
        {view === 'side' && status === 'ready' && !compact && kmh > 0 && !realTime && (
          <div className="absolute right-3 top-3 pointer-events-none rounded-full px-2.5 py-1 text-white" style={{ ...GLASS, fontSize: 11 }}>
            {SURFACE_WORDS[surface] || 'mặt đất'}
          </div>
        )}
        {showCoat && (
          <div className={`absolute pointer-events-none ${compact ? 'left-2 bottom-2' : 'left-3 bottom-3'}`}>
            <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-white" style={{ ...GLASS, fontSize: compact ? 10 : 12 }}>
              <span className="inline-block rounded-full" style={{ width: 10, height: 10, background: coat.swatch, boxShadow: '0 0 0 1.5px rgba(255,255,255,.7)' }} />
              <span className="font-semibold">{coat.label}</span>
            </div>
          </div>
        )}

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[#0b2a20]" style={{ fontSize: compact ? 11 : 13 }}>
            Đang tải mô hình 3D…
          </div>
        )}
        {status === 'stale' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-[#0b2a20]" style={{ fontSize: compact ? 11 : 13 }}>
            Trang vừa có bản cập nhật — tải lại để xem mô hình 3D.
            <Button size="small" onClick={() => window.location.reload()}>
              Tải lại trang
            </Button>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center pointer-events-none text-[#0b2a20]" style={{ fontSize: compact ? 11 : 13 }}>
            Không hiển thị được mô hình 3D trên thiết bị này.
          </div>
        )}
        {creditInFrame && (
          <Tooltip
            trigger={['hover', 'focus', 'click']}
            placement="topRight"
            title={
              <div className="text-xs leading-snug">
                <div>{MOVING_HORSE.credit}</div>
                {surface === 'pasture' && <div className="mt-1">{PASTURE_CREDIT.full}</div>}
              </div>
            }
          >
            <button
              type="button"
              aria-label="Nguồn mô hình 3D"
              className={`absolute flex h-6 w-6 cursor-pointer items-center justify-center rounded-full p-0 text-white ${compact ? 'right-2 bottom-2' : 'right-3 bottom-3'}`}
              style={{ ...GLASS, fontSize: 12 }}
            >
              <InfoCircleOutlined />
            </button>
          </Tooltip>
        )}
      </div>
      {!creditInFrame && (
        <>
          <div className="text-right text-gray-400 mt-1 truncate" style={{ fontSize: compact ? 9 : 10 }} title={MOVING_HORSE.credit}>
            {MOVING_HORSE.credit}
          </div>
          {surface === 'pasture' && (
            <div className="text-right text-gray-400 truncate" style={{ fontSize: compact ? 9 : 10 }} title={PASTURE_CREDIT.full}>
              {PASTURE_CREDIT.short}
            </div>
          )}
        </>
      )}
    </div>
  );
}
