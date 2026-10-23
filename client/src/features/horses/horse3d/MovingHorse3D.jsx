import { useEffect, useRef, useState } from 'react';
import { coatFor } from './horseBreeds';
import { loadModelViewer, paintCoat } from './modelViewer';
import { MOVING_HORSE } from './horseMotion';

const STAGE_BG =
  'radial-gradient(90% 70% at 50% 28%, rgba(16,120,86,.55) 0%, rgba(2,44,34,0) 60%), radial-gradient(120% 90% at 50% 100%, #03251c 0%, #01110c 70%)';
const GLASS = { background: 'rgba(1,17,12,.62)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(6px)' };
const TONES = { alert: '#fca5a5', warn: '#fde68a' };
// One stripe pattern of the track, in px: it scrolls this far per cycle.
const STRIPE = 80;

/**
 * A horse in 3D doing something: walking, trotting, galloping, grazing, resting — `motion` from
 * horseMotion.js. It wears its own coat (breed / colour on record). The clips run on the spot, so the
 * track under it scrolls with the speed; uphill work is drawn on a slope.
 *
 * `view`: 'side' (side on, the legs read best) or 'turntable' (turns slowly by itself).
 */
export default function MovingHorse3D({ breed, color, motion, height = 260, view = 'side', compact = false, showCoat = false, className = '' }) {
  const viewer = useRef(null);
  const [status, setStatus] = useState('loading');
  const [progress, setProgress] = useState(0);
  // The clip played once (motion.then follows it) that has ended.
  const [ended, setEnded] = useState(null);
  const coat = coatFor({ breed, color });
  const coatNow = useRef(coat);
  coatNow.current = coat;
  const clip = motion?.then && ended === motion.clip ? motion.then : motion?.clip || 'Idle';
  const playsOnce = Boolean(motion?.then) && clip === motion.clip;

  useEffect(() => {
    let alive = true;
    loadModelViewer().catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = viewer.current;
    if (!el) return undefined;
    const onLoad = () => {
      paintCoat(el, coatNow.current, MOVING_HORSE.coatMaterials);
      setStatus('ready');
    };
    const onError = () => setStatus('error');
    const onProgress = (e) => setProgress(e.detail?.totalProgress || 0);
    el.addEventListener('load', onLoad);
    el.addEventListener('error', onError);
    el.addEventListener('progress', onProgress);
    return () => {
      el.removeEventListener('load', onLoad);
      el.removeEventListener('error', onError);
      el.removeEventListener('progress', onProgress);
    };
  }, []);

  useEffect(() => {
    if (status === 'ready') paintCoat(viewer.current, coat, MOVING_HORSE.coatMaterials);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, coat.key]);

  // The pace of the legs follows the speed.
  const timeScale = motion?.timeScale || 1;
  useEffect(() => {
    if (viewer.current) viewer.current.timeScale = timeScale;
  }, [timeScale, status]);

  // A clip played once (pulling up): when it ends, the next one takes over.
  useEffect(() => {
    const el = viewer.current;
    if (status !== 'ready' || !el || !playsOnce) return undefined;
    const onFinished = () => setEnded(clip);
    el.addEventListener('finished', onFinished);
    // After model-viewer switched to the clip: play it once instead of looping.
    const start = setTimeout(() => el.play({ repetitions: 1 }), 50);
    return () => {
      clearTimeout(start);
      el.removeEventListener('finished', onFinished);
    };
  }, [status, clip, playsOnce]);

  const kmh = motion?.kmh || 0;
  const tilt = motion?.tilt || 0;
  // About 4 px of track per km/h each second: a gallop streams past, a walk drifts.
  const trackSeconds = kmh > 0 ? STRIPE / (kmh * 4) : 0;
  const caption = motion?.label;

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-xl select-none" style={{ height, background: STAGE_BG }}>
        {/* Only while it moves: the track, tilted on a slope, its marks streaming back at the horse's speed. */}
        {trackSeconds > 0 && status === 'ready' && (
          <div className="absolute pointer-events-none" style={{ left: '-10%', right: '-10%', bottom: '13%', height: '5%', transform: `rotate(${-tilt}deg)`, transformOrigin: '50% 50%' }}>
            <div
              className="moving-horse-track h-full w-full"
              style={{
                background: `repeating-linear-gradient(90deg, rgba(234,179,8,.16) 0 ${STRIPE / 4}px, transparent ${STRIPE / 4}px ${STRIPE}px)`,
                maskImage: 'linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent)',
                WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent)',
                '--track-seconds': `${trackSeconds.toFixed(2)}s`,
              }}
            />
          </div>
        )}
        <model-viewer
          ref={viewer}
          src={MOVING_HORSE.src}
          alt={`Ngựa 3D — ${caption || 'đứng yên'}`}
          camera-controls=""
          disable-zoom=""
          disable-pan=""
          touch-action="pan-y"
          interaction-prompt="none"
          {...(view === 'turntable' ? { 'auto-rotate': '', 'auto-rotate-delay': '2500', 'rotation-per-second': '18deg' } : {})}
          autoplay=""
          animation-name={clip}
          animation-crossfade-duration="350"
          camera-orbit={view === 'turntable' ? MOVING_HORSE.turntableOrbit : MOVING_HORSE.sideOrbit}
          min-camera-orbit="auto 40deg auto"
          max-camera-orbit="auto 98deg auto"
          field-of-view="28deg"
          shadow-intensity="1.1"
          shadow-softness="0.85"
          environment-image="neutral"
          exposure="1.05"
          tone-mapping="neutral"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            background: 'transparent',
            '--poster-color': 'transparent',
            opacity: status === 'ready' ? 1 : 0,
            transition: 'opacity .5s ease',
            transform: tilt ? `rotate(${-tilt}deg)` : undefined,
          }}
        />

        {caption && status === 'ready' && (
          <div className={`absolute pointer-events-none ${compact ? 'left-2 top-2' : 'left-3 top-3'}`}>
            <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold" style={{ ...GLASS, fontSize: compact ? 10 : 12, color: TONES[motion?.tone] || '#fff' }}>
              {caption}
              {kmh > 0 && <span className="font-normal opacity-80 tabular-nums">· {Math.round(kmh)} km/h</span>}
            </div>
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <div className="text-white/80" style={{ fontSize: compact ? 11 : 13 }}>
              Đang tải mô hình 3D{progress ? ` · ${Math.round(progress * 100)}%` : '…'}
            </div>
            <div className="rounded-full overflow-hidden" style={{ width: '40%', height: 3, background: 'rgba(255,255,255,.12)' }}>
              <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#eab308,#fde68a)', transition: 'width .2s' }} />
            </div>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-white/80 pointer-events-none" style={{ fontSize: compact ? 11 : 13 }}>
            Không tải được mô hình 3D — cần kết nối mạng để tải trình xem.
          </div>
        )}
      </div>
      <div className="text-right text-gray-400 mt-1 truncate" style={{ fontSize: compact ? 9 : 10 }} title={MOVING_HORSE.credit}>
        {MOVING_HORSE.credit}
      </div>
    </div>
  );
}
