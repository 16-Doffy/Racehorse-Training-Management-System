import { useEffect, useRef, useState } from 'react';
import { coatFor } from './horseBreeds';
import { MOVING_HORSE, PASTURE_CREDIT } from './horseMotion';

const GLASS = { background: 'rgba(1,17,12,.62)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(6px)' };
const TONES = { alert: '#fca5a5', warn: '#fde68a' };
const SURFACE_WORDS = { turf: 'mặt cỏ', dirt: 'mặt đất', sand: 'mặt cát', synthetic: 'mặt tổng hợp', pasture: 'đồng cỏ' };

/**
 * A horse in 3D doing something — walking, trotting, galloping, lame, pulled up, grazing, resting —
 * `motion` from horseMotion.js, on the track `surface` its plan trains on (turf, dirt, sand,
 * synthetic). It wears its own coat (breed / colour on record). The stage itself is horseStage.js
 * (three.js), loaded with this component so pages without a horse don't carry it.
 *
 * `view`: 'side' (side on, the track streams by, drag to look around) or 'turntable' (turns by itself).
 */
export default function MovingHorse3D({ breed, color, motion, surface = 'dirt', height = 260, view = 'side', compact = false, showCoat = false, className = '' }) {
  const canvas = useRef(null);
  const box = useRef(null);
  const stage = useRef(null);
  const [status, setStatus] = useState('loading');
  const coat = coatFor({ breed, color });
  const latest = useRef({ coat, motion, surface });
  latest.current = { coat, motion, surface };

  useEffect(() => {
    let alive = true;
    let observer = null;
    import('./horseStage')
      .then(({ createHorseStage }) => {
        if (!alive || !canvas.current) return;
        const s = createHorseStage(canvas.current, { view });
        stage.current = s;
        const { coat: c, motion: m, surface: f } = latest.current;
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
  // A new motion object each render: changed only when what it says changes.
  const motionKey = JSON.stringify(motion || {});
  useEffect(() => {
    stage.current?.setMotion(latest.current.motion);
  }, [motionKey, status]);

  const kmh = motion?.kmh || 0;
  const caption = motion?.label;

  return (
    <div className={className}>
      <div ref={box} className="relative overflow-hidden rounded-xl select-none bg-[#9fbfcf]" style={{ height }}>
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
        {view === 'side' && status === 'ready' && !compact && kmh > 0 && (
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
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center pointer-events-none text-[#0b2a20]" style={{ fontSize: compact ? 11 : 13 }}>
            Không hiển thị được mô hình 3D trên thiết bị này.
          </div>
        )}
      </div>
      <div className="text-right text-gray-400 mt-1 truncate" style={{ fontSize: compact ? 9 : 10 }} title={MOVING_HORSE.credit}>
        {MOVING_HORSE.credit}
      </div>
      {surface === 'pasture' && (
        <div className="text-right text-gray-400 truncate" style={{ fontSize: compact ? 9 : 10 }} title={PASTURE_CREDIT.full}>
          {PASTURE_CREDIT.short}
        </div>
      )}
    </div>
  );
}
