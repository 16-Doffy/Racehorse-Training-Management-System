import { useEffect, useMemo, useRef, useState } from 'react';
import { coatFor } from './horse3d/horseBreeds';
import { HORSE_MODEL, loadModelViewer, paintCoat } from './horse3d/modelViewer';
import { CARE_EVENT_META } from '../../constants/care';
import { KIND_COLOR, buildCarePins } from './careMapPins';
// The 3D viewer is styled by the vet's stylesheet, whose rules all sit under .vet-ui.
import '../../components/veterinarian/vet.css';

// The horse without saddle and bridle, as in the injury viewer: the neck, the back and the hooves show.
const BARE_MODEL = `${import.meta.env.BASE_URL}models/horse-bare.glb`;
const VIEWS = [
  { key: 'left', label: 'Trái', orbit: '90deg 80deg 80%' },
  { key: 'right', label: 'Phải', orbit: '-90deg 80deg 80%' },
  { key: 'front', label: 'Trước', orbit: '0deg 78deg 85%' },
  { key: 'back', label: 'Sau', orbit: '180deg 78deg 85%' },
];
const STAGE_BG =
  'radial-gradient(90% 70% at 50% 28%, rgba(16,120,86,.5) 0%, rgba(2,44,34,0) 60%), radial-gradient(120% 90% at 50% 100%, #03251c 0%, #01110c 70%)';
const GLASS = { background: 'rgba(1,17,12,.62)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(6px)' };
const asAttr = (v) => `${v.x}m ${v.y}m ${v.z}m`;

/**
 * Where a horse's routine care was done, on the horse in 3D: a pin on each hoof a farrier worked on, on
 * the neck, chest or rump where a vaccine went in, on the mouth or nose for a dewormer. Red = a hoof in a
 * poor state or a shot the horse reacted to. Drag to turn, tap a pin for what was done and when.
 * `events`: GET /horses/:id/care-events. Read-only.
 */
export default function CareBodyMap({ horse, events = [], height = 380 }) {
  const viewer = useRef(null);
  const [status, setStatus] = useState('loading');
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState('left');
  const [openId, setOpenId] = useState(null);
  const coat = coatFor({ breed: horse?.breed, color: horse?.color });
  const coatNow = useRef(coat);
  const pins = useMemo(() => buildCarePins(events), [events]);

  useEffect(() => {
    coatNow.current = coat;
  });

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

  useEffect(() => {
    if (status === 'ready') paintCoat(viewer.current, coat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, coat.key]);

  const goTo = (next) => {
    setView(next.key);
    const el = viewer.current;
    if (!el) return;
    el.cameraTarget = 'auto auto auto';
    el.cameraOrbit = next.orbit;
  };

  const kindsPresent = Object.keys(KIND_COLOR).filter((k) => pins.some((p) => p.kind === k));

  return (
    <div className="vet-ui">
      <div className="vet-3d">
        <div className="vet-3d-stage" style={{ height, background: STAGE_BG }}>
          <model-viewer
            ref={viewer}
            src={BARE_MODEL}
            alt={`Mô hình 3D ${horse?.name || 'ngựa'} với các chỗ đã chăm sóc`}
            camera-controls=""
            disable-pan=""
            interaction-prompt="none"
            camera-orbit={VIEWS[0].orbit}
            min-camera-orbit="auto 20deg 35%"
            max-camera-orbit="auto 100deg 170%"
            field-of-view="30deg"
            shadow-intensity="1"
            shadow-softness="0.9"
            environment-image="neutral"
            exposure="1.05"
            tone-mapping="neutral"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'transparent', '--poster-color': 'transparent', opacity: status === 'ready' ? 1 : 0, transition: 'opacity .3s' }}
          >
            {pins.map((p) => {
              const open = openId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  slot={`hotspot-care-${p.id}`}
                  className={`vet-hs${open ? ' is-open' : ''}`}
                  data-position={asAttr(p.position)}
                  data-normal={p.normal ? asAttr(p.normal) : undefined}
                  style={{ '--c': p.color }}
                  onClick={() => setOpenId(open ? null : p.id)}
                  aria-label={`${p.title}: ${p.lines.join('; ')}`}
                >
                  <span className="vet-hs-ring" aria-hidden="true" />
                  <span className="vet-hs-dot" aria-hidden="true" />
                  <span className="vet-hs-label">
                    <b>{p.title}</b>
                    {p.lines.map((line) => (
                      <i key={line}>{line}</i>
                    ))}
                    {p.more > 0 && <i>và {p.more} lần nữa</i>}
                  </span>
                </button>
              );
            })}
          </model-viewer>

          <div className="vet-3d-views" style={GLASS}>
            {VIEWS.map((v) => (
              <button key={v.key} type="button" className={view === v.key ? 'is-active' : ''} onClick={() => goTo(v)} aria-pressed={view === v.key} title={`Nhìn từ phía ${v.label.toLowerCase()}`}>
                {v.label}
              </button>
            ))}
          </div>

          {status === 'ready' && (
            <div className="vet-3d-hint" style={GLASS}>
              <i className="bi bi-hand-index" aria-hidden="true" /> {pins.length ? 'Bấm một điểm để xem · kéo để xoay' : 'Kéo để xoay · cuộn để phóng to'}
            </div>
          )}

          {status === 'ready' && pins.length > 0 && (
            <div className="vet-3d-legend" style={GLASS}>
              {kindsPresent.map((k) => (
                <span key={k}>
                  <span className="vet-3d-swatch" style={{ background: KIND_COLOR[k] }} />
                  {CARE_EVENT_META[k]?.label}
                </span>
              ))}
              <span>
                <span className="vet-3d-swatch" style={{ background: '#ef4444' }} />
                Cần chú ý
              </span>
            </div>
          )}

          {status === 'ready' && pins.length === 0 && (
            <div className="vet-3d-legend" style={GLASS}>Chưa có lần chăm sóc nào gắn với một vị trí trên thân ngựa</div>
          )}

          {status === 'loading' && (
            <div className="vet-3d-overlay">
              <div>Đang tải mô hình 3D{progress ? ` · ${Math.round(progress * 100)}%` : '…'}</div>
              <div className="vet-3d-bar">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}
          {status === 'error' && (
            <div className="vet-3d-overlay">
              <div>Không tải được mô hình 3D — cần kết nối mạng để tải trình xem. Xem danh sách bên cạnh.</div>
            </div>
          )}
        </div>
        <div className="vet-3d-credit" title={HORSE_MODEL.credit}>
          {HORSE_MODEL.credit} · bản đã bỏ yên cương
        </div>
      </div>
    </div>
  );
}
