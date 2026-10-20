import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'antd';
import { HORSE_MODEL } from '../../horses/horse3d/modelViewer';
import { stallState } from './stallStatus';

const SKY = { light: 0xcfe0e8, dark: 0x0e1f2a };

/**
 * A zone of the stable in 3D as a farm barn (stallScene.js), with one stall in view. `stalls` is
 * a zone's stalls from GET /stable/stalls (or a single stall); clicking a stall calls
 * onSelect(code). three.js and the scene load on first use, so pages without it don't carry them.
 * The sky follows the light/dark canvas (MainLayout's `wdp-dark-portals` body class).
 */
export default function Stall3D({ stalls = [], focusCode, onSelect, height = 380, className = '' }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const stallsRef = useRef(stalls);
  const focusRef = useRef(focusCode);
  // The latest props for the scene's callbacks and effects, refreshed before those effects run.
  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
    stallsRef.current = stalls;
    focusRef.current = focusCode;
  });
  const [status, setStatus] = useState('loading');
  const [horseFailed, setHorseFailed] = useState(false);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let engine = null;
    let resize;
    let theme;
    import('./stallScene')
      .then(({ createStallScene }) => {
        if (cancelled || !canvasRef.current) return;
        try {
          engine = createStallScene(canvasRef.current, { onSelect: (code) => onSelectRef.current?.(code) });
        } catch {
          setStatus('error'); // no WebGL on this device
          return;
        }
        engineRef.current = engine;
        const fit = () => hostRef.current && engine.resize(hostRef.current.clientWidth, hostRef.current.clientHeight);
        fit();
        resize = new ResizeObserver(fit);
        resize.observe(hostRef.current);
        const sky = () => engine.setBackground(document.body.classList.contains('wdp-dark-portals') ? SKY.dark : SKY.light);
        sky();
        theme = new MutationObserver(sky);
        theme.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        engine.horseReady.catch(() => !cancelled && setHorseFailed(true));
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
      resize?.disconnect();
      theme?.disconnect();
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Rebuild only when what is drawn changes; a new array with the same stalls keeps the camera where it is.
  const signature = useMemo(
    () => JSON.stringify(stalls.map((s) => [s.code, stallState(s), s.occupant?.horse?.name, s.occupant?.horse?.breed, s.occupant?.horse?.color, s.zoneName, s.zonePurpose])),
    [stalls],
  );
  useEffect(() => {
    if (status === 'ready' && stallsRef.current.length) engineRef.current?.setStalls(stallsRef.current, focusRef.current);
  }, [status, signature]);
  useEffect(() => {
    if (status !== 'ready') return;
    if (focusCode) engineRef.current?.focus(focusCode);
  }, [status, focusCode]);

  const focused = stalls.find((s) => s.code === focusCode);
  return (
    <div className={className}>
      <div ref={hostRef} className="relative w-full overflow-hidden rounded-xl border border-[#E2D9C8] bg-[#CFE0E8]" style={{ height }}>
        <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label="Khu chuồng ngựa 3D" />
        {focused && (
          <span className="light-surface-box absolute left-3 top-3 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-800 shadow-sm">
            {focused.code} · {focused.zoneName}
          </span>
        )}
        {status === 'ready' && (
          <div className="absolute bottom-3 right-3 flex flex-wrap justify-end gap-1.5">
            <Button size="small" onClick={() => engineRef.current?.overview()}>Toàn khu</Button>
            <Button size="small" disabled={!focusCode} onClick={() => engineRef.current?.focus(focusCode)}>Cửa chuồng</Button>
            <Button
              size="small"
              type={spinning ? 'primary' : 'default'}
              aria-pressed={spinning}
              onClick={() => { engineRef.current?.setAutoRotate(!spinning); setSpinning(!spinning); }}
            >
              Tự xoay
            </Button>
          </div>
        )}
        {status === 'loading' && (
          <div className="absolute inset-0 grid place-items-center text-sm text-gray-600">Đang dựng khu chuồng 3D…</div>
        )}
        {status === 'error' && (
          <div className="light-surface-box absolute inset-0 grid place-items-center bg-white p-4 text-center text-sm text-gray-600">
            Thiết bị này không mở được 3D. Sơ đồ và thông tin chuồng vẫn dùng được.
          </div>
        )}
        {horseFailed && (
          <div className="light-surface-box absolute bottom-12 left-3 right-3 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700">
            Chưa tải được mô hình ngựa; chuồng vẫn hiển thị.
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">{HORSE_MODEL.credit}. Chuồng, nhân viên và trang trại vẽ bằng code.</p>
    </div>
  );
}
