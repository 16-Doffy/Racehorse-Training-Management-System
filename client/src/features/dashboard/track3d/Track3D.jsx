import { useEffect, useRef, useState } from 'react';
import { Button, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { MOVING_HORSE } from '../../horses/horse3d/horseMotion';

const GLASS = { background: 'rgba(1,17,12,.62)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(6px)' };

/**
 * The training oval in 3D (trackStage.js, three.js), loaded with this component so pages without it
 * don't carry it. `runners`: [{ id, name, coat, note, over, share, kmh }], a horse on the track at
 * `share` of its course, or waiting by the finish post without one. `focus`: the id of the horse whose
 * name is picked out. `label`: what the picture shows, for a screen reader.
 */
export default function Track3D({ runners, focus = null, height = 360, label, className = '' }) {
  const canvas = useRef(null);
  const layer = useRef(null);
  const box = useRef(null);
  const stage = useRef(null);
  const [status, setStatus] = useState('loading');
  // The latest list, for the stage once it has loaded (kept up to date after each render).
  const latest = useRef(runners);
  useEffect(() => {
    latest.current = runners;
  });

  useEffect(() => {
    let alive = true;
    let observer = null;
    import('./trackStage')
      // The stage's own file did not load: a page opened before a deploy asks for a file of the old build.
      .catch(() => {
        if (alive) setStatus('stale');
        return null;
      })
      .then((mod) => {
        if (!mod?.createTrackStage || !alive || !canvas.current) return;
        const s = mod.createTrackStage(canvas.current, layer.current);
        stage.current = s;
        s.setRunners(latest.current);
        observer = new ResizeObserver(([entry]) => s.resize(entry.contentRect.width, entry.contentRect.height));
        observer.observe(box.current);
        s.ready.then(() => alive && setStatus('ready')).catch(() => alive && setStatus('error'));
      })
      // No WebGL on this device, or the model would not load.
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
      observer?.disconnect();
      stage.current?.dispose();
      stage.current = null;
    };
  }, []);

  // A new list each render: sent on only when what it says changes.
  const key = (runners || []).map((r) => [r.id, r.name, r.coat?.key, r.note, r.over, r.share == null ? '' : r.share.toFixed(4), Math.round(r.kmh || 0)].join('|')).join(';');
  useEffect(() => {
    stage.current?.setRunners(latest.current);
  }, [key, status]);
  useEffect(() => {
    stage.current?.setFocus(focus);
  }, [focus, status]);

  return (
    <div className={className}>
      <div ref={box} className="relative overflow-hidden rounded-lg select-none bg-[#9fbfcf]" style={{ height }}>
        <canvas ref={canvas} role="img" aria-label={label} className="absolute inset-0 block h-full w-full" style={{ opacity: status === 'ready' ? 1 : 0, transition: 'opacity .4s ease' }} />
        {/* The horses' names, placed over the canvas by the stage. */}
        <div ref={layer} className="pointer-events-none absolute inset-0" aria-hidden="true" />

        {status === 'loading' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-[#0b2a20]">Đang dựng sân tập 3D…</div>}
        {status === 'stale' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-[13px] text-[#0b2a20]">
            Trang vừa có bản cập nhật — tải lại để xem sân tập 3D.
            <Button size="small" onClick={() => window.location.reload()}>
              Tải lại trang
            </Button>
          </div>
        )}
        {status === 'error' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-[13px] text-[#0b2a20]">
            Không hiển thị được sân tập 3D trên thiết bị này. Danh sách bên cạnh vẫn cập nhật theo cảm biến.
          </div>
        )}
        {status === 'ready' && (
          <div className="pointer-events-none absolute bottom-2 left-2 hidden rounded-full px-2.5 py-1 text-[11px] text-white [@media(pointer:fine)]:block" style={GLASS}>
            Kéo để xoay sân
          </div>
        )}
        <Tooltip trigger={['hover', 'focus', 'click']} placement="topRight" title={<div className="text-xs leading-snug">{MOVING_HORSE.credit}</div>}>
          <button
            type="button"
            aria-label="Nguồn mô hình 3D"
            className="absolute bottom-2 right-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full p-0 text-[12px] text-white"
            style={GLASS}
          >
            <InfoCircleOutlined />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
