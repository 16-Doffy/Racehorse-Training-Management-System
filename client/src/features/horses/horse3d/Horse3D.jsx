import { useEffect, useRef, useState } from 'react';
import { breedOf, coatFor } from './horseBreeds';
import { HORSE_MODEL, loadModelViewer, paintCoat } from './modelViewer';

const STAGE_BG =
  'radial-gradient(90% 70% at 50% 28%, rgba(16,120,86,.55) 0%, rgba(2,44,34,0) 60%), radial-gradient(120% 90% at 50% 100%, #03251c 0%, #01110c 70%)';
const FLOOR_BG = 'radial-gradient(50% 50% at 50% 50%, rgba(234,179,8,.22) 0%, rgba(234,179,8,.06) 45%, transparent 72%)';
const GLASS = { background: 'rgba(1,17,12,.62)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(6px)' };

/**
 * A horse in 3D, painted the way it is on record: its own coat colour, or else the coat its breed
 * is known for (horseBreeds.js). Turned 360° with the mouse or a finger, and slowly by itself. The
 * Manager watches it change while picking the breed; whoever the horse is assigned to sees the same
 * horse, and so does the groom on the phone.
 *
 * `compact`: only the horse and its coat, for a small slot in place of a photo.
 */
export default function Horse3D({ breed, color, height = 280, compact = false, className = '' }) {
  const viewer = useRef(null);
  const [status, setStatus] = useState('loading');
  const [progress, setProgress] = useState(0);
  const coat = coatFor({ breed, color });
  const known = breedOf(breed);
  const coatNow = useRef(coat);
  coatNow.current = coat;

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
    // Painted before it is shown, so the grey model never appears.
    const onLoad = () => {
      paintCoat(el, coatNow.current);
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

  // Another breed or coat picked: the same horse, repainted at once and turned back to face the
  // Manager, wherever it had turned to by itself; it holds still a moment before turning again.
  const shownCoat = useRef(null);
  const resume = useRef(null);
  useEffect(() => {
    const el = viewer.current;
    if (status !== 'ready' || !el) return;
    paintCoat(el, coat);
    if (shownCoat.current && shownCoat.current !== coat.key) {
      el.autoRotate = false;
      el.resetTurntableRotation?.(0);
      el.cameraOrbit = HORSE_MODEL.cameraOrbit;
      clearTimeout(resume.current);
      resume.current = setTimeout(() => {
        el.autoRotate = true;
      }, 2500);
    }
    shownCoat.current = coat.key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, coat.key]);
  useEffect(() => () => clearTimeout(resume.current), []);

  const breedName = known?.label || breed || 'Chưa chọn giống';
  const coatChip = (
    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-white" style={{ ...GLASS, fontSize: compact ? 10 : 12 }}>
      <span className="inline-block rounded-full" style={{ width: 10, height: 10, background: coat.swatch, boxShadow: '0 0 0 1.5px rgba(255,255,255,.7)' }} />
      <span className="font-semibold">{coat.label}</span>
      {!compact && <span className="opacity-70">· {coat.from === 'breed' ? 'màu đặc trưng của giống' : coat.hint}</span>}
    </div>
  );

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-xl select-none" style={{ height, background: STAGE_BG }}>
        <div className="absolute rounded-full" style={{ left: '8%', right: '8%', bottom: '8%', height: '22%', background: FLOOR_BG }} />
        <model-viewer
          ref={viewer}
          src={HORSE_MODEL.src}
          alt={`Ngựa 3D — ${breedName}, lông ${coat.label.toLowerCase()}`}
          camera-controls=""
          disable-zoom=""
          disable-pan=""
          touch-action="pan-y"
          interaction-prompt="none"
          auto-rotate=""
          auto-rotate-delay="2500"
          rotation-per-second="18deg"
          // A boolean, not "": once <model-viewer> is defined React 19 sets it as a property, and "" turned autoplay off.
          autoplay
          animation-name={HORSE_MODEL.animation}
          camera-orbit={HORSE_MODEL.cameraOrbit}
          min-camera-orbit="auto 40deg auto"
          max-camera-orbit="auto 98deg auto"
          field-of-view="28deg"
          shadow-intensity="1.1"
          shadow-softness="0.85"
          environment-image="neutral"
          exposure={1.05}
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
          }}
        />

        {!compact && (
          <div className="absolute left-3 top-3 pointer-events-none">
            <div className="text-white font-semibold leading-tight" style={{ fontSize: 15, textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>
              {breedName}
            </div>
            {known && (
              <div className="text-white/70" style={{ fontSize: 11 }}>
                {known.region} · {known.origin}
              </div>
            )}
          </div>
        )}

        <div className={`absolute pointer-events-none ${compact ? 'left-2 bottom-2' : 'left-3 bottom-3'}`}>{coatChip}</div>

        {!compact && status === 'ready' && (
          <div className="absolute right-3 bottom-3 pointer-events-none text-white/70" style={{ fontSize: 11 }}>
            Kéo để xoay 360°
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
      <div className="text-right text-gray-400 mt-1 truncate" style={{ fontSize: 10 }} title={HORSE_MODEL.credit}>
        {HORSE_MODEL.credit}
      </div>
    </div>
  );
}
