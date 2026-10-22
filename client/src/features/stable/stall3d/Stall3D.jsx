import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Popover, Space, Tooltip } from 'antd';
import {
  AimOutlined,
  BorderOuterOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  GatewayOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  QuestionCircleOutlined,
  SyncOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { HORSE_MODEL } from '../../horses/horse3d/modelViewer';
import { STALL_STATES, stallState } from './stallStatus';

const SKY = { light: 0xcfe0e8, dark: 0x0e1f2a };
const HINT_KEY = 'wdp301_stall3d_hint_seen';

const CONTROLS_HELP = [
  ['Kéo chuột trái', 'xoay quanh'],
  ['Kéo chuột phải · Shift + kéo', 'đi ngang khắp khu'],
  ['Lăn chuột', 'phóng to / thu nhỏ đúng chỗ con trỏ'],
  ['Nhấp vào chuồng', 'chọn chuồng'],
  ['Nhấp đúp', 'tới cửa chuồng, hoặc tới chỗ đó và xoay quanh'],
  ['W A S D · phím mũi tên', 'đi tới, lùi, sang ngang (giữ Shift để nhanh)'],
  ['Q · E', 'quay trái / phải'],
  ['+ · −', 'phóng to / thu nhỏ'],
  ['Điện thoại', 'một ngón xoay, hai ngón kéo và chụm để đi, phóng to'],
];

const readHintSeen = () => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * A zone of the stable in 3D as a farm barn (stallScene.js), with one stall in view. `stalls` is a
 * zone's stalls from GET /stable/stalls (or a single stall); clicking a stall calls onSelect(code).
 * The camera is free: turn, slide over the yard, zoom to the pointer, walk with the keys, double-click to
 * go somewhere; ready-made views (the whole zone, from above, standing in the aisle, at the stall's
 * door) and a tour from stall to stall. three.js and the scene load on first use, so pages without it
 * don't carry them. The sky follows the light/dark canvas (MainLayout's `wdp-dark-portals` body class).
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
  const [touring, setTouring] = useState(false);
  const [hover, setHover] = useState(null);
  const [full, setFull] = useState(false);
  const [hintSeen, setHintSeen] = useState(readHintSeen);
  // A narrow view (a phone, a small card) shows the view buttons as icons; a touch screen gets finger hints.
  const [narrow, setNarrow] = useState(false);
  const [touch] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches);

  const seeHint = () => {
    setHintSeen(true);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // Private window: the hint just shows again next time.
    }
  };

  useEffect(() => {
    let cancelled = false;
    let engine = null;
    let resize;
    let theme;
    import('./stallScene')
      .then(({ createStallScene }) => {
        if (cancelled || !canvasRef.current) return;
        try {
          engine = createStallScene(canvasRef.current, {
            onSelect: (code) => onSelectRef.current?.(code),
            onHover: (code, x, y) => setHover(code ? { code, x, y, width: canvasRef.current?.clientWidth || 0 } : null),
            onInteract: () => setTouring(false),
          });
        } catch {
          setStatus('error'); // no WebGL on this device
          return;
        }
        engineRef.current = engine;
        const fit = () => {
          if (!hostRef.current) return;
          engine.resize(hostRef.current.clientWidth, hostRef.current.clientHeight);
          setNarrow(hostRef.current.clientWidth < 620);
        };
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
    if (focusCode && !engineRef.current?.touring) engineRef.current?.focus(focusCode);
  }, [status, focusCode]);

  // Full screen: the 3D view alone on the screen, back with Esc or the button.
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === hostRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else hostRef.current?.requestFullscreen?.().catch(() => {});
  };

  const view = (name) => {
    setTouring(false);
    engineRef.current?.view(name);
  };
  const toggleTour = () => {
    if (touring) {
      engineRef.current?.stopTour();
      setTouring(false);
      return;
    }
    // The stalls with a horse first; a zone with none tours every stall.
    const withHorse = stalls.filter((s) => s.occupied).map((s) => s.code);
    engineRef.current?.startTour(withHorse.length ? withHorse : stalls.map((s) => s.code));
    setTouring(true);
  };

  const focused = stalls.find((s) => s.code === focusCode);
  const hovered = hover && stalls.find((s) => s.code === hover.code);
  const hoveredState = hovered && STALL_STATES[stallState(hovered)];
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  const help = (
    <div className="max-w-[300px] text-xs">
      <div className="mb-1.5 font-semibold">Điều khiển khu chuồng 3D</div>
      <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1">
        {CONTROLS_HELP.map(([how, what]) => (
          <div key={how} className="contents">
            <dt className="font-medium">{how}</dt>
            <dd className="m-0 opacity-80">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  return (
    <div className={className}>
      <div
        ref={hostRef}
        className={`group relative w-full overflow-hidden border border-[#E2D9C8] bg-[#CFE0E8] ${full ? '' : 'rounded-xl'}`}
        style={{ height: full ? '100%' : height }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          className="block h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-inset"
          aria-label="Khu chuồng ngựa 3D"
          title="Kéo để xoay · chuột phải để đi ngang · lăn để phóng to · nhấp đúp để tới chỗ đó · W A S D để đi"
          onPointerDown={() => !hintSeen && seeHint()}
        />

        {status === 'ready' && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
            {focused ? (
              <span className="light-surface-box pointer-events-auto rounded-full border border-gray-200 bg-white/95 px-3 py-1 text-xs font-semibold text-gray-800 shadow-sm">
                {focused.code} · {focused.zoneName}
              </span>
            ) : (
              <span />
            )}
            <Space.Compact size="small" className="pointer-events-auto shadow-sm">
              <Tooltip title="Toàn khu, nhìn chéo từ trên">
                <Button size="small" icon={<ZoomOutOutlined />} aria-label="Toàn khu" onClick={() => view('overview')}>
                  {!narrow && 'Toàn khu'}
                </Button>
              </Tooltip>
              <Tooltip title="Nhìn thẳng từ trên xuống, như sơ đồ">
                <Button size="small" icon={<BorderOuterOutlined />} aria-label="Từ trên" onClick={() => view('top')}>
                  {!narrow && 'Từ trên'}
                </Button>
              </Tooltip>
              <Tooltip title="Đứng ở đầu lối đi, ngang tầm mắt — dùng W A S D để đi dọc">
                <Button size="small" icon={<GatewayOutlined />} aria-label="Lối đi" onClick={() => view('aisle')}>
                  {!narrow && 'Lối đi'}
                </Button>
              </Tooltip>
              <Tooltip title="Tới cửa chuồng đang chọn">
                <Button size="small" icon={<AimOutlined />} aria-label="Cửa chuồng" disabled={!focusCode} onClick={() => { setTouring(false); engineRef.current?.focus(focusCode); }}>
                  {!narrow && 'Cửa chuồng'}
                </Button>
              </Tooltip>
            </Space.Compact>
          </div>
        )}

        {status === 'ready' && (
          <div className="pointer-events-none absolute bottom-3 right-3 flex flex-wrap justify-end gap-1.5">
            <Button
              size="small"
              className="pointer-events-auto shadow-sm"
              type={touring ? 'primary' : 'default'}
              icon={touring ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              aria-pressed={touring}
              aria-label={touring ? 'Dừng tham quan' : 'Tham quan'}
              onClick={toggleTour}
            >
              {narrow ? null : touring ? 'Dừng tham quan' : 'Tham quan'}
            </Button>
            <Tooltip title="Camera tự xoay quanh khu">
              <Button
                size="small"
                className="pointer-events-auto shadow-sm"
                type={spinning ? 'primary' : 'default'}
                icon={<SyncOutlined spin={spinning} />}
                aria-pressed={spinning}
                aria-label="Tự xoay"
                onClick={() => {
                  engineRef.current?.setAutoRotate(!spinning);
                  setSpinning(!spinning);
                }}
              />
            </Tooltip>
            {canFullscreen && (
              <Tooltip title={full ? 'Thoát toàn màn hình (Esc)' : 'Toàn màn hình'}>
                <Button
                  size="small"
                  className="pointer-events-auto shadow-sm"
                  icon={full ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  aria-label={full ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                  onClick={toggleFull}
                />
              </Tooltip>
            )}
            <Popover content={help} placement="topRight" trigger="click">
              <Button size="small" className="pointer-events-auto shadow-sm" icon={<QuestionCircleOutlined />} aria-label="Cách điều khiển" />
            </Popover>
          </div>
        )}

        {status === 'ready' && !hintSeen && (
          <button
            type="button"
            onClick={seeHint}
            className={`absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-1.5 text-left text-[11px] leading-snug text-white backdrop-blur-sm ${narrow ? 'max-w-[55%]' : 'max-w-[60%]'}`}
          >
            {touch
              ? 'Một ngón để xoay · hai ngón để đi và phóng to · chạm đúp để tới chỗ đó'
              : narrow
                ? 'Kéo để xoay · chuột phải để đi · lăn để phóng to'
                : 'Kéo để xoay · chuột phải để đi ngang · lăn để phóng to · nhấp đúp để tới chỗ đó · W A S D để đi'}
            <span className="ml-1 opacity-70">(bấm để ẩn)</span>
          </button>
        )}

        {hovered && hover && (
          <div
            className="light-surface-box pointer-events-none absolute z-10 rounded-lg border border-gray-200 bg-white/95 px-2.5 py-1.5 text-xs text-gray-800 shadow-md"
            style={{ left: Math.max(8, Math.min(hover.x + 14, hover.width - 190)), top: Math.max(8, hover.y - 46) }}
          >
            <div className="font-semibold tabular-nums">{hovered.code}</div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: hoveredState.color }} />
              {hovered.status === 'maintenance' ? 'Bảo trì' : hovered.occupant?.horse?.name || (hovered.occupied ? 'Có ngựa' : 'Trống')}
            </div>
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
