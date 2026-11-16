import { useEffect, useRef, useState } from 'react';
import { Button, Empty, Progress, Segmented, Slider, Spin, Tooltip } from 'antd';
import { CaretRightOutlined, CloseOutlined, DownloadOutlined, FullscreenExitOutlined, FullscreenOutlined, PauseOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { message } from '../../lib/antdStatic';
import { trainingSessionApi } from './trainingApi';
import { OBJECTIVE_LABELS, SESSION_KINDS, SURFACE_LABELS, segmentAtDistance, sessionTargets } from './trainingVocab';
import { motionAt } from './SessionReplay';
import MovingHorse3D from '../horses/horse3d/MovingHorse3D';
import { hourOf, surfaceOf } from '../horses/horse3d/horseMotion';

// Milliseconds each reading (5 s of the run) stays on screen: about 8×, 20× and 50× the real pace.
const SPEEDS = [
  { label: '×8', value: 600 },
  { label: '×20', value: 250 },
  { label: '×50', value: 100 },
];
// A saved video lasts about this long, however long the run was (within the paces below).
const VIDEO_SECONDS = 75;
const VIDEO_SIZE = { width: 1280, height: 720 };
const GLASS = { background: 'rgba(1,17,12,.62)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(6px)' };

const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
// "Sao Mai" → "sao-mai": the file name stays plain.
const slug = (s) =>
  String(s || 'ngua')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const pickMime = () =>
  typeof MediaRecorder === 'undefined' ? null : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || null;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** One frame of the saved video: the 3D run, the horse and session on top, the figures along the bottom. */
function drawFrame(ctx, source, hud) {
  const { width: W, height: H } = ctx.canvas;
  ctx.fillStyle = '#0b2a20';
  ctx.fillRect(0, 0, W, H);
  if (source?.width) ctx.drawImage(source, 0, 0, W, H);
  const font = (weight, size) => `${weight} ${size}px "Be Vietnam Pro", "Inter", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';

  // Who and what, top left; the gait under it.
  ctx.font = font(700, 30);
  const title = `${hud.horse} · ${hud.kind}`;
  ctx.font = font(500, 20);
  const sub = hud.when;
  ctx.font = font(700, 30);
  const boxW = Math.max(ctx.measureText(title).width, 300) + 48;
  ctx.fillStyle = 'rgba(1,17,12,0.62)';
  roundRect(ctx, 28, 26, boxW, 92, 16);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, 52, 58);
  ctx.font = font(500, 20);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText(sub, 52, 94);
  if (hud.gait) {
    ctx.font = font(600, 20);
    const gw = ctx.measureText(hud.gait).width + 36;
    ctx.fillStyle = 'rgba(212,175,55,0.92)';
    roundRect(ctx, 28, 130, gw, 40, 20);
    ctx.fill();
    ctx.fillStyle = '#10261e';
    ctx.fillText(hud.gait, 46, 150);
  }

  // The club, top right.
  ctx.font = font(700, 20);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Racehorse TMS', W - 36, 50);
  if (hud.segment) {
    ctx.font = font(500, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(hud.segment, W - 36, 80);
  }
  ctx.textAlign = 'left';

  // The figures, along the bottom, with the run's progress under them.
  const barY = H - 128;
  ctx.fillStyle = 'rgba(1,17,12,0.66)';
  roundRect(ctx, 28, barY, W - 56, 100, 18);
  ctx.fill();
  const cells = [
    ['Thời gian', `${clock(hud.elapsed)} / ${clock(hud.total)}`],
    ['Tốc độ', hud.speed != null ? `${Math.round(hud.speed)} km/h` : '—'],
    ['Nhịp tim', hud.hr != null ? `${Math.round(hud.hr)} bpm` : '—'],
    ['Quãng đường', `${Math.round(hud.distance || 0)}${hud.targetDistance ? ` / ${hud.targetDistance}` : ''} m`],
  ];
  const cellW = (W - 56) / cells.length;
  cells.forEach(([label, value], i) => {
    const x = 28 + cellW * i + 28;
    ctx.font = font(500, 17);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(label, x, barY + 30);
    ctx.font = font(700, 30);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(value, x, barY + 64);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, 52, barY + 86, W - 104, 6, 3);
  ctx.fill();
  ctx.fillStyle = '#d4af37';
  roundRect(ctx, 52, barY + 86, Math.max(6, (W - 104) * Math.min(1, hud.total ? hud.elapsed / hud.total : 0)), 6, 3);
  ctx.fill();
}

/** The figures beside the run, as the video shows them, over the 3D stage. */
function Hud({ hud }) {
  const cells = [
    ['Tốc độ', hud.speed != null ? `${Math.round(hud.speed)} km/h` : '—'],
    ['Nhịp tim', hud.hr != null ? `${Math.round(hud.hr)} bpm` : '—'],
    ['Quãng đường', `${Math.round(hud.distance || 0)}${hud.targetDistance ? ` / ${hud.targetDistance}` : ''} m`],
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 right-12 flex flex-wrap gap-x-5 gap-y-1 rounded-xl px-4 py-2 text-white" style={GLASS}>
      {cells.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <div className="text-[11px] text-white/65">{label}</div>
          <div className="text-base font-semibold tabular-nums leading-tight">{value}</div>
        </div>
      ))}
      {hud.segment && <div className="ml-auto self-center text-xs text-white/80">{hud.segment}</div>}
    </div>
  );
}

/** The player: the run in 3D as a video, its figures, the controls and the save. */
function Player({ session, readings, horse, plan }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [pace, setPace] = useState(SPEEDS[1].value);
  const [recording, setRecording] = useState(null); // { progress }
  const [full, setFull] = useState(false);
  const frame = useRef(null);
  const stageBox = useRef(null);
  const recorder = useRef(null);
  const hudRef = useRef(null);
  const last = readings.length - 1;
  const running = playing && index < last;

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, last)), pace);
    return () => clearInterval(timer);
  }, [running, pace, last]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const target = sessionTargets(session);
  const r = readings[index];
  const start = new Date(readings[0].at || session.actualStartAt).getTime();
  const total = new Date(readings[last].at || session.actualEndAt || start).getTime() - start;
  const elapsed = r?.at ? new Date(r.at).getTime() - start : (index / Math.max(1, last)) * total;
  const seg = segmentAtDistance(session, r?.distance ?? 0);
  const motion = motionAt(session, readings, index, running, target, pace);
  const kind = SESSION_KINDS[session.kind]?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập';
  const surface = surfaceOf(plan, session.scheduledAt);
  const hud = {
    horse: horse?.name || session.horse?.name || 'Ngựa',
    kind,
    when: `${dayjs(session.actualStartAt || session.scheduledAt).format('DD/MM/YYYY · HH:mm')}${SURFACE_LABELS[surface] ? ` · ${SURFACE_LABELS[surface]}` : ''}`,
    gait: motion?.label || '',
    segment: seg ? `Đoạn ${seg.segmentIndex + 1}/${seg.segmentCount}: ${seg.segmentLabel}` : '',
    elapsed,
    total,
    speed: r?.speed,
    hr: r?.hr,
    distance: r?.distance,
    targetDistance: target.distance,
  };
  hudRef.current = hud;

  const goTo = (i) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, i)));
  };
  const toggle = () => {
    if (running) return setPlaying(false);
    if (index >= last) setIndex(0);
    return setPlaying(true);
  };
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else frame.current?.requestFullscreen?.();
  };

  // ---- Saving the video: the run played from the start into a canvas of its own, frame by frame. ----
  const stopRecording = (save) => {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    cancelAnimationFrame(rec.raf);
    rec.save = save;
    if (rec.media.state !== 'inactive') rec.media.stop();
    setPace(rec.pace);
    setRecording(null);
  };
  const startRecording = () => {
    const source = stageBox.current?.querySelector('canvas');
    const mime = pickMime();
    if (!source || !mime || !HTMLCanvasElement.prototype.captureStream) {
      message.error('Trình duyệt này chưa ghi được video — hãy mở bằng Chrome, Edge hoặc Firefox.');
      return;
    }
    const out = document.createElement('canvas');
    out.width = VIDEO_SIZE.width;
    out.height = VIDEO_SIZE.height;
    const ctx = out.getContext('2d');
    const media = new MediaRecorder(out.captureStream(30), { mimeType: mime, videoBitsPerSecond: 5_000_000 });
    const chunks = [];
    const rec = { media, raf: 0, pace, save: true };
    media.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    media.onstop = () => {
      if (!rec.save || !chunks.length) return;
      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `buoi-tap-${slug(hud.horse)}-${dayjs(session.actualStartAt || session.scheduledAt).format('YYYYMMDD-HHmm')}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      message.success('Đã lưu video buổi tập về máy.');
    };
    const draw = () => {
      drawFrame(ctx, source, hudRef.current);
      rec.raf = requestAnimationFrame(draw);
    };
    recorder.current = rec;
    setPace(Math.max(80, Math.min(400, Math.round((VIDEO_SECONDS * 1000) / Math.max(1, last)))));
    setIndex(0);
    setPlaying(true);
    setRecording({ progress: 0 });
    draw();
    media.start(500);
  };
  // The run played to its end: a second on the last frame, then the file.
  useEffect(() => {
    if (!recording) return undefined;
    setRecording((rec) => (rec ? { progress: Math.round((index / Math.max(1, last)) * 100) } : rec));
    if (index < last) return undefined;
    const timer = setTimeout(() => stopRecording(true), 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, Boolean(recording)]);
  useEffect(() => () => stopRecording(false), []);

  return (
    <div className="flex flex-col gap-3">
      <div ref={frame} className={`relative overflow-hidden rounded-xl bg-black ${full ? 'flex flex-col justify-center' : ''}`}>
        <div ref={stageBox} className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
          <MovingHorse3D
            fill
            recordable
            height={200}
            className="h-full"
            breed={horse?.breed}
            color={horse?.color}
            motion={motion}
            surface={surface}
            hour={hourOf(session.actualStartAt || session.scheduledAt)}
          />
          <Hud hud={hud} />
          {recording && (
            <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-2 bg-black/55 px-3 py-1.5 text-xs text-white">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
              Đang tạo video… {recording.progress}%
            </div>
          )}
        </div>
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 ${full ? 'bg-black' : 'bg-[#0b2a20]'}`}>
          <Button
            type="primary"
            shape="circle"
            disabled={Boolean(recording)}
            icon={running ? <PauseOutlined /> : index >= last ? <ReloadOutlined /> : <CaretRightOutlined />}
            onClick={toggle}
            aria-label={running ? 'Tạm dừng' : index >= last ? 'Phát lại từ đầu' : 'Phát'}
          />
          <span className="tabular-nums text-xs text-white/80">
            {clock(elapsed)} / {clock(total)}
          </span>
          <Slider className="!m-0 min-w-[120px] flex-1" min={0} max={last} value={index} onChange={goTo} disabled={Boolean(recording)} tooltip={{ formatter: (i) => clock((readings[i]?.at ? new Date(readings[i].at).getTime() : start) - start) }} aria-label="Tua video" />
          <Segmented size="small" options={SPEEDS} value={pace} onChange={setPace} disabled={Boolean(recording)} aria-label="Tốc độ phát" />
          <Tooltip title={full ? 'Thoát toàn màn hình' : 'Toàn màn hình'}>
            <Button type="text" className="!text-white" icon={full ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={toggleFull} aria-label="Toàn màn hình" />
          </Tooltip>
          {recording ? (
            <Button size="small" danger icon={<CloseOutlined />} onClick={() => stopRecording(false)}>
              Hủy
            </Button>
          ) : (
            <Tooltip title={`Tạo tệp video khoảng ${VIDEO_SECONDS} giây từ buổi chạy và lưu về máy`}>
              <Button size="small" icon={<DownloadOutlined />} onClick={startRecording}>
                Tải video
              </Button>
            </Tooltip>
          )}
        </div>
        {recording && <Progress percent={recording.progress} showInfo={false} size="small" strokeColor="#d4af37" className="!m-0 !leading-none" />}
      </div>

    </div>
  );
}

/**
 * A finished run as a video (TrainingSession.trace, kept since 26/10/2026): the horse in 3D runs it again
 * reading by reading — tiring or going lame where it did, on the plan's track under the sky of its hour —
 * with its speed, heart rate and distance over it. It plays, seeks, goes full screen, and saves as a video
 * file made on the viewer's own device. Shown inside a session's own page (the owner's SessionDetail).
 */
export default function SessionVideo({ session, horse, plan }) {
  const id = session?._id;
  const { data: readings, isLoading, isError, refetch } = useQuery({
    queryKey: ['session-replay', id],
    queryFn: () => trainingSessionApi.readings(id).then((res) => res?.data || []),
    enabled: Boolean(id),
    staleTime: Infinity,
  });
  if (isLoading) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-black/5">
        <Spin />
      </div>
    );
  }
  if (isError) {
    return (
      <Empty description="Chưa tải được số đo của buổi này.">
        <Button onClick={() => refetch()}>Thử lại</Button>
      </Empty>
    );
  }
  if ((readings || []).length < 2) {
    return <Empty description="Buổi này không lưu số đo từng lần nên không có video: buổi nhập số tay, hoặc chạy trước ngày 26/10/2026." />;
  }
  return <Player key={id} session={session} readings={readings} horse={horse} plan={plan} />;
}
