import { useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { coatFor } from './horseBreeds';
import { MOVING_HORSE } from './horseMotion';
import ModelCredit from './ModelCredit';

const GLASS = { background: 'rgba(9,13,20,.72)', border: '1px solid rgba(255,255,255,.16)', backdropFilter: 'blur(6px)' };
const SURFACE_WORDS = { turf: 'mặt cỏ', dirt: 'mặt đất', sand: 'mặt cát', synthetic: 'mặt tổng hợp' };

/**
 * Panoramic shared 3D racetrack displaying ALL concurrent running horses side-by-side
 * in parallel lanes inside ONE lightweight WebGL context. Clicking any floating horse badge
 * focuses that horse's detailed heart-rate chart and controls right underneath.
 */
export default function MultiHorseTrack3D({
  items = [],
  surface = 'dirt',
  hour = null,
  height = 240,
  selectedId = null,
  onSelect,
  className = '',
}) {
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const stageRef = useRef(null);
  const badgeRefs = useRef(new Map());
  const [status, setStatus] = useState('loading');

  const mappedItems = items.slice(0, 5).map((item) => ({
    ...item,
    coat: coatFor({ breed: item.horse?.breed, color: item.horse?.color }),
  }));
  const latestRef = useRef({ items: mappedItems, surface, hour });
  useEffect(() => {
    latestRef.current = { items: mappedItems, surface, hour };
  });

  useEffect(() => {
    let alive = true;
    let observer = null;
    import('./multiTrackStage')
      .catch(() => {
        if (alive) setStatus('stale');
        return null;
      })
      .then((mod) => {
        if (!mod?.createMultiTrackStage || !alive || !canvasRef.current) return;
        const stage = mod.createMultiTrackStage(canvasRef.current, {
          onProject: (positions) => {
            for (const [id, el] of badgeRefs.current.entries()) {
              const p = positions[id];
              if (!el || !p || !p.visible) {
                if (el) el.style.opacity = '0';
                continue;
              }
              el.style.opacity = '1';
              el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0) translate(-50%, -100%)`;
            }
          },
        });
        stageRef.current = stage;
        const { items: curItems, surface: curSurf, hour: curHour } = latestRef.current;
        stage.setHour(curHour);
        stage.setSurface(curSurf);
        stage.setHorses(curItems);
        observer = new ResizeObserver(([entry]) => stage.resize(entry.contentRect.width, entry.contentRect.height));
        observer.observe(boxRef.current);
        stage.ready.then(() => alive && setStatus('ready')).catch(() => alive && setStatus('error'));
      })
      .catch(() => alive && setStatus('error'));

    return () => {
      alive = false;
      observer?.disconnect();
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    stageRef.current?.setSurface(surface);
  }, [surface, status]);

  const quarter = hour == null ? null : Math.floor(hour * 4) / 4;
  useEffect(() => {
    stageRef.current?.setHour(quarter);
  }, [quarter, status]);

  const itemsSig = JSON.stringify(
    mappedItems.map((it) => ({
      id: it.id,
      coat: it.coat.key,
      pct: it.pct,
      motion: it.motion,
    })),
  );
  useEffect(() => {
    stageRef.current?.setHorses(latestRef.current.items);
  }, [itemsSig, status]);

  const overflowCount = Math.max(0, items.length - 5);

  return (
    <div className={className}>
      <div
        ref={boxRef}
        className="relative overflow-hidden rounded-xl select-none bg-[#9fbfcf]"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`Sân chạy chung 3D — ${mappedItems.length} ngựa đang tập trên ${SURFACE_WORDS[surface] || 'mặt đất'}`}
          className="absolute inset-0 block h-full w-full"
          style={{ opacity: status === 'ready' ? 1 : 0, transition: 'opacity .35s ease', touchAction: 'pan-y' }}
        />

        {/* Top-left compact live track indicator */}
        {status === 'ready' && (
          <div className="pointer-events-none absolute left-3 top-2.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={GLASS}>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Sân chạy chung 3D · {mappedItems.length} làn{overflowCount > 0 ? ` (+${overflowCount})` : ''}
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] text-white/90" style={GLASS}>
              {SURFACE_WORDS[surface] || 'mặt đất'}
            </span>
          </div>
        )}

        {/* Floating clickable pills projected directly above each horse on the track */}
        {status === 'ready' &&
          mappedItems.map((item) => {
            const isSelected = String(item.id) === String(selectedId);
            const alert = Boolean(item.over || item.motion?.tone === 'alert');
            const dotColor = alert ? '#ef4444' : item.finishing ? '#eab308' : '#22c55e';
            return (
              <button
                key={item.id}
                type="button"
                ref={(el) => {
                  if (el) badgeRefs.current.set(String(item.id), el);
                  else badgeRefs.current.delete(String(item.id));
                }}
                onClick={() => onSelect?.(item.id)}
                style={{
                  ...GLASS,
                  opacity: 0,
                  borderColor: alert ? 'rgba(239,68,68,0.85)' : isSelected ? '#eab308' : 'rgba(255,255,255,0.2)',
                  boxShadow: isSelected ? '0 0 0 1.5px rgba(234,179,8,0.55)' : undefined,
                }}
                className="absolute left-0 top-0 z-10 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white transition-colors hover:brightness-110"
                title="Bấm để mở biểu đồ chi tiết của ngựa này"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor }} />
                <span>{item.name}</span>
                {item.heartRate != null && (
                  <span className={`tabular-nums ${alert ? 'text-rose-300' : 'text-slate-200'}`}>
                    · {Math.round(item.heartRate)} bpm
                  </span>
                )}
              </button>
            );
          })}

        {status === 'loading' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[#0b2a20]">
            Đang tải sân chạy chung 3D…
          </div>
        )}
        {status === 'stale' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-[#0b2a20]">
            Trang vừa có bản cập nhật — tải lại để xem mô hình 3D.
            <Button size="small" onClick={() => window.location.reload()}>
              Tải lại trang
            </Button>
          </div>
        )}
        {status === 'error' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-[#0b2a20]">
            Không hiển thị được sân 3D trên thiết bị này.
          </div>
        )}

        <ModelCredit lines={[MOVING_HORSE.credit]} style={{ right: 10, bottom: 8 }} />
      </div>
    </div>
  );
}
