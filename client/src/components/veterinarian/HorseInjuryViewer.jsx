import { useEffect, useRef, useState } from 'react';
import { coatFor } from '../../features/horses/horse3d/horseBreeds';
import { HORSE_MODEL, loadModelViewer, paintCoat } from '../../features/horses/horse3d/modelViewer';
import { INTERNAL_PARTS, bodyFrame, coordinatesFor, frameFromCoordinates, pointOnMidline, regionAt } from './horseRegions';
import { SEVERITY_META, recoveryMeta, shortBodyPart } from './vetFormat';

// The horse of every other screen without its saddle and bridle (same rig and units), so the back and
// the head can be examined and marked.
const BARE_MODEL = `${import.meta.env.BASE_URL}models/horse-bare.glb`;
const CREDIT = `${HORSE_MODEL.credit} · bản đã bỏ yên cương`;
const VIEWS = [
  { key: 'left', label: 'Trái', orbit: '90deg 80deg 105%' },
  { key: 'right', label: 'Phải', orbit: '-90deg 80deg 105%' },
  { key: 'front', label: 'Trước', orbit: '0deg 78deg 110%' },
  { key: 'back', label: 'Sau', orbit: '180deg 78deg 110%' },
];
const SEVERITY_COLOR = { mild: '#38bdf8', moderate: '#f59e0b', severe: '#ef4444' };
const GHOST = [0.72, 0.86, 0.95]; // the see-through body of the inside view
const STAGE_BG =
  'radial-gradient(90% 70% at 50% 28%, rgba(16,120,86,.5) 0%, rgba(2,44,34,0) 60%), radial-gradient(120% 90% at 50% 100%, #03251c 0%, #01110c 70%)';
const GLASS = { background: 'rgba(1,17,12,.62)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(6px)' };
const GROUPS = [...new Set(INTERNAL_PARTS.map((p) => p.group))];

const round = (v) => ({ x: Math.round(v.x * 10000) / 10000, y: Math.round(v.y * 10000) / 10000, z: Math.round(v.z * 10000) / 10000 });
const asAttr = (v) => `${v.x}m ${v.y}m ${v.z}m`;
const slotName = (prefix, v) => `${prefix}-${asAttr(v).replace(/[^0-9a-z-]/gi, '_')}`;

/** Where a mark goes: where it was marked on the 3D horse, or — for a mark made on the old side picture — on the body's midline. */
function markPoint(marker) {
  const loc = marker.location3d;
  if (loc?.position) return { position: loc.position, normal: loc.layer === 'internal' ? null : loc.normal || null, internal: loc.layer === 'internal' };
  const { along, height } = frameFromCoordinates(marker.coordinates);
  return { position: pointOnMidline(along, height), normal: null, internal: false };
}

/** Turns the body see-through (the inside view) or back, restoring each material as the model had it. */
function setInsideView(el, inside, coat, originals) {
  const materials = el?.model?.materials || [];
  materials.forEach((m) => {
    if (!originals.has(m)) originals.set(m, { mode: m.getAlphaMode?.() || 'OPAQUE', color: [...m.pbrMetallicRoughness.baseColorFactor] });
    const was = originals.get(m);
    if (inside) {
      m.setAlphaMode?.('BLEND');
      m.pbrMetallicRoughness.setBaseColorFactor([...GHOST, m.name === 'M_Eye' ? 0.35 : 0.14]);
    } else {
      m.setAlphaMode?.(was.mode);
      m.pbrMetallicRoughness.setBaseColorFactor(was.color);
    }
  });
  if (!inside) paintCoat(el, coat);
}

/**
 * The horse in 3D with its injuries on it. Turn it by dragging, zoom with the wheel, or jump to a side.
 * Two layers: "Ngoài da" (the skin) and "Bên trong" (the body see-through, with its organs and deep
 * structures). `interactive`: picking a place calls onPick({ location3d, coordinates, region }) — the
 * point on the skin (or the organ), the matching side-view coordinates, and the name of that part of
 * the body ("Khớp cổ chân trước trái", "Phổi phải"). `picked` is the place chosen so far.
 * `selectedId`: the injury a list beside it has chosen — its mark opens (and the inside view shows when
 * it is inside); clicking a mark calls onSelect(id).
 */
export default function HorseInjuryViewer({ horse, injuries = [], interactive = false, picked = null, onPick, selectedId, onSelect, height = 380 }) {
  const viewer = useRef(null);
  const pressedAt = useRef(null);
  const pickRef = useRef(onPick);
  const layerRef = useRef('surface');
  const originals = useRef(new Map());
  const [status, setStatus] = useState('loading');
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState('left');
  const [layer, setLayer] = useState(() => (picked?.location3d?.layer === 'internal' ? 'internal' : 'surface'));
  const [openId, setOpenId] = useState(null);
  const coat = coatFor({ breed: horse?.breed, color: horse?.color });
  const coatNow = useRef(coat);

  useEffect(() => {
    pickRef.current = onPick;
    coatNow.current = coat;
    layerRef.current = layer;
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
    const onDown = (e) => {
      pressedAt.current = { x: e.clientX, y: e.clientY };
    };
    const onClick = (e) => {
      // Inside, the organs are picked from their own points; a click on the see-through skin does nothing.
      if (!pickRef.current || layerRef.current === 'internal' || e.target.closest?.('[slot^="hotspot"]')) return;
      const from = pressedAt.current;
      if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 6) return; // that was a drag turning the horse
      const hit = el.positionAndNormalFromPoint?.(e.clientX, e.clientY);
      if (!hit) return;
      const material = el.materialFromPoint?.(e.clientX, e.clientY)?.name || null;
      const position = round(hit.position);
      pickRef.current({
        location3d: { position, normal: round(hit.normal), layer: 'surface' },
        coordinates: coordinatesFor(bodyFrame(position)),
        region: regionAt(position, material),
      });
    };
    el.addEventListener('load', onLoad);
    el.addEventListener('error', onError);
    el.addEventListener('progress', onProgress);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('load', onLoad);
      el.removeEventListener('error', onError);
      el.removeEventListener('progress', onProgress);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('click', onClick);
    };
  }, []);

  // The injury chosen beside the viewer: its label open, on the layer it is on.
  useEffect(() => {
    if (selectedId === undefined) return;
    setOpenId(selectedId);
    const chosen = injuries.find((m) => m._id === selectedId);
    if (chosen) setLayer(chosen.location3d?.layer === 'internal' ? 'internal' : 'surface');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // The coat of the horse (another horse chosen in the form), and the see-through body of the inside view.
  useEffect(() => {
    if (status === 'ready') setInsideView(viewer.current, layer === 'internal', coat, originals.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, coat.key, layer]);

  const goTo = (next) => {
    setView(next.key);
    const el = viewer.current;
    if (!el) return;
    el.cameraTarget = 'auto auto auto';
    el.cameraOrbit = next.orbit;
  };

  const pickPart = (part) =>
    onPick?.({ location3d: { position: part.position, layer: 'internal' }, coordinates: coordinatesFor(part), region: part.label });

  const pickedLoc = picked?.location3d?.position ? picked.location3d : null;
  const pickedPart = pickedLoc?.layer === 'internal' ? INTERNAL_PARTS.find((p) => asAttr(p.position) === asAttr(pickedLoc.position)) : null;

  return (
    <div className="vet-3d">
      <div className="vet-3d-stage" style={{ height, background: STAGE_BG }}>
        <model-viewer
          ref={viewer}
          src={BARE_MODEL}
          alt={`Mô hình 3D ${horse?.name || 'ngựa'} để đánh dấu chấn thương`}
          camera-controls=""
          disable-pan=""
          interaction-prompt="none"
          camera-orbit={VIEWS[0].orbit}
          min-camera-orbit="auto 20deg 45%"
          max-camera-orbit="auto 100deg 170%"
          field-of-view="30deg"
          shadow-intensity="1"
          shadow-softness="0.9"
          environment-image="neutral"
          exposure="1.05"
          tone-mapping="neutral"
          className={interactive && layer === 'surface' ? 'is-picking' : undefined}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'transparent', '--poster-color': 'transparent', opacity: status === 'ready' ? 1 : 0, transition: 'opacity .4s ease' }}
        >
          {layer === 'internal' &&
            INTERNAL_PARTS.filter((p) => p !== pickedPart).map((p) => (
              <button
                key={p.key}
                type="button"
                slot={`hotspot-organ-${p.key}`}
                className={`vet-organ${interactive ? '' : ' is-static'}`}
                data-position={asAttr(p.position)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (interactive) pickPart(p);
                }}
                title={p.label}
                aria-label={interactive ? `Chọn ${p.label}` : p.label}
              >
                <span className="vet-organ-dot" aria-hidden="true" />
                <span className="vet-hs-label">
                  <b>{p.label}</b>
                </span>
              </button>
            ))}
          {injuries.map((m) => {
            const { position, normal, internal } = markPoint(m);
            const meta = SEVERITY_META[m.severity] || SEVERITY_META.moderate;
            const open = openId === m._id;
            return (
              <button
                key={`${m._id}-${asAttr(position)}`}
                type="button"
                slot={`hotspot-${m._id}`}
                className={`vet-hs${open ? ' is-open' : ''}${internal ? ' is-internal' : ''}`}
                data-position={asAttr(position)}
                data-normal={normal ? asAttr(normal) : undefined}
                style={{ '--c': SEVERITY_COLOR[m.severity] || SEVERITY_COLOR.moderate }}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenId(open ? null : m._id);
                  if (!open) onSelect?.(m._id);
                }}
                aria-label={`${shortBodyPart(m.bodyPart)} — ${meta.label}`}
              >
                <span className="vet-hs-ring" aria-hidden="true" />
                <span className="vet-hs-dot" aria-hidden="true" />
                <span className="vet-hs-label">
                  <b>{shortBodyPart(m.bodyPart)}</b>
                  <i>
                    {internal ? 'Bên trong · ' : ''}
                    {meta.label} · {recoveryMeta(m.recoveryStatus).label}
                  </i>
                </span>
              </button>
            );
          })}
          {pickedLoc && (
            <div
              key={slotName('picked', pickedLoc.position)}
              slot={slotName('hotspot-picked', pickedLoc.position)}
              className="vet-hs is-picked is-open"
              data-position={asAttr(pickedLoc.position)}
              data-normal={pickedLoc.layer !== 'internal' && pickedLoc.normal ? asAttr(pickedLoc.normal) : undefined}
            >
              <span className="vet-hs-pin" aria-hidden="true">
                <i className="bi bi-crosshair" />
              </span>
              {pickedPart && (
                <span className="vet-hs-label" style={{ '--c': '#ef4444' }}>
                  <b>{pickedPart.label}</b>
                </span>
              )}
            </div>
          )}
        </model-viewer>

        <div className="vet-3d-views" style={GLASS}>
          {VIEWS.map((v) => (
            <button key={v.key} type="button" className={view === v.key ? 'is-active' : ''} onClick={() => goTo(v)} aria-pressed={view === v.key} title={`Nhìn từ phía ${v.label.toLowerCase()}`}>
              {v.label}
            </button>
          ))}
        </div>

        <div className="vet-3d-layers">
          <div className="vet-3d-views is-layers" style={GLASS} role="radiogroup" aria-label="Lớp hiển thị">
            {[
              { key: 'surface', label: 'Ngoài da', icon: 'bi-person-standing' },
              { key: 'internal', label: 'Bên trong', icon: 'bi-lungs' },
            ].map((l) => (
              <button key={l.key} type="button" role="radio" aria-checked={layer === l.key} className={layer === l.key ? 'is-active' : ''} onClick={() => setLayer(l.key)}>
                <i className={`bi ${l.icon}`} aria-hidden="true" /> {l.label}
              </button>
            ))}
          </div>
          {layer === 'internal' && interactive && (
            <select
              className="vet-3d-select"
              value={pickedPart?.key || ''}
              onChange={(e) => {
                const part = INTERNAL_PARTS.find((p) => p.key === e.target.value);
                if (part) pickPart(part);
              }}
              aria-label="Chọn cơ quan bên trong"
            >
              <option value="">Chọn cơ quan / cấu trúc…</option>
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {INTERNAL_PARTS.filter((p) => p.group === g).map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        {status === 'ready' && (
          <div className="vet-3d-hint" style={GLASS}>
            {layer === 'internal' ? (
              <>
                <i className="bi bi-info-circle" aria-hidden="true" /> {interactive ? 'Bấm một điểm cơ quan, hoặc chọn trong danh sách' : 'Vị trí cơ quan là ước lượng theo giải phẫu'}
              </>
            ) : interactive ? (
              <>
                <i className="bi bi-hand-index" aria-hidden="true" /> Bấm lên thân ngựa để đánh dấu · kéo để xoay
              </>
            ) : (
              <>
                <i className="bi bi-arrows-move" aria-hidden="true" /> Kéo để xoay · cuộn để phóng to
              </>
            )}
          </div>
        )}

        {injuries.length > 0 && status === 'ready' && (
          <div className="vet-3d-legend" style={GLASS}>
            {Object.entries(SEVERITY_META).map(([key, m]) => (
              <span key={key}>
                <span className="vet-3d-swatch" style={{ background: SEVERITY_COLOR[key] }} />
                {m.label}
              </span>
            ))}
          </div>
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
            <div>Không tải được mô hình 3D — cần kết nối mạng để tải trình xem.{interactive ? ' Vẫn có thể gõ vị trí tổn thương.' : ''}</div>
          </div>
        )}
      </div>
      <div className="vet-3d-credit" title={CREDIT}>
        {CREDIT}
      </div>
    </div>
  );
}
