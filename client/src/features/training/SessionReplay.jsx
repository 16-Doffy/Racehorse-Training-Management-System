import { useEffect, useState } from 'react';
import { Button, Empty, Modal, Segmented, Slider, Spin, Typography } from 'antd';
import { CaretRightOutlined, PauseOutlined, ReloadOutlined } from '@ant-design/icons';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { trainingSessionApi } from './trainingApi';
import { SESSION_KINDS, OBJECTIVE_LABELS, sessionTargets } from './trainingVocab';
import { FOREST, STATUS_TONES } from '../../layouts/forestTheme';
import MovingHorse3D from '../horses/horse3d/MovingHorse3D';
import { hourOf, liveMotion, surfaceOf } from '../horses/horse3d/horseMotion';
import Telemetry from './Telemetry';

const { Text } = Typography;
const GRID = '#E4DFD3';
const AXIS = '#8A8578';
// How long each reading stays on screen while playing (the sensors sent one every 5 s).
const PACES = [
  { label: 'Chậm', value: 1200 },
  { label: 'Vừa', value: 600 },
  { label: 'Nhanh', value: 250 },
];

/**
 * What the horse does at reading `i`: the gait of that reading's speed, tired or lame from the
 * reading the scenario started on, a trial running in to its finish post (`pace` ms to the next
 * reading); on the last one, pulled up on the sore leg if the feed stopped the run as a suspected
 * injury, else standing once the playback is over.
 */
function motionAt(session, readings, i, running, target, pace) {
  const r = readings[i];
  const last = i === readings.length - 1;
  const trial = session.kind === 'trial';
  if (last && r.scenario === 'injury' && session.abortCategory === 'injury') return liveMotion(session, 0, { stopped: true });
  if (last && !running) {
    return { clip: 'Idle', timeScale: 1, label: session.status === 'aborted' ? 'Dừng giữa chừng' : 'Kết thúc buổi', kmh: 0, ...(trial ? { course: { remaining: 0, finishIn: 0 } } : {}) };
  }
  const step = i > 0 ? r.distance - readings[i - 1].distance : undefined;
  return liveMotion({ ...session, simScenario: r.scenario || 'normal' }, r.speed, trial ? { remaining: target.distance - r.distance, step, finishIn: pace / 1000 } : {});
}

/** One small line over the run, with its target and where the playback is; a click goes to that reading. */
function RunLine({ data, dataKey, unit, label, target, index, onPick }) {
  const values = data.map((d) => d[dataKey]).filter((v) => v != null);
  const top = Math.max(target || 0, ...values);
  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 6, right: 8, bottom: 0, left: -18 }}
          onClick={(state) => {
            const i = Number(state?.activeTooltipIndex ?? state?.activeIndex);
            if (Number.isFinite(i)) onPick(i);
          }}
        >
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="i" hide />
          <YAxis domain={[0, Math.ceil(top * 1.1)]} tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={44} />
          <Tooltip formatter={(v) => [`${v} ${unit}`, label]} labelFormatter={(i) => `Lần đo ${Number(i) + 1}`} />
          {target ? <ReferenceLine y={target} stroke={STATUS_TONES.bad.color} strokeDasharray="4 4" /> : null}
          <ReferenceLine x={index} stroke={FOREST.primary} strokeWidth={1.5} />
          <Line type="monotone" dataKey={dataKey} stroke={FOREST.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The playback itself, given the run's readings; a new session starts it again from the first one. */
function ReplayBody({ session, readings, horse, plan }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [pace, setPace] = useState(PACES[1].value);
  const last = readings.length - 1;
  // Playing stops by itself on the last reading.
  const running = playing && index < last;
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, last)), pace);
    return () => clearInterval(timer);
  }, [running, pace, last]);

  const target = sessionTargets(session);
  const r = readings[index];
  const data = readings.map((x, i) => ({ i, hr: x.hr, speed: x.speed }));
  const goTo = (i) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, i)));
  };
  const toggle = () => {
    if (running) {
      setPlaying(false);
      return;
    }
    if (index >= last) setIndex(0);
    setPlaying(true);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-6">
        <MovingHorse3D
          breed={horse?.breed}
          color={horse?.color}
          motion={motionAt(session, readings, index, running, target, pace)}
          surface={surfaceOf(plan, session.scheduledAt)}
          hour={hourOf(session.actualStartAt || session.scheduledAt)}
          height={260}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="primary"
            icon={running ? <PauseOutlined /> : index >= last ? <ReloadOutlined /> : <CaretRightOutlined />}
            onClick={toggle}
            aria-label={running ? 'Tạm dừng' : index >= last ? 'Phát lại từ đầu' : 'Phát'}
          />
          <Slider className="!m-0 min-w-[140px] flex-1" min={0} max={last} value={index} onChange={goTo} tooltip={{ formatter: (v) => `Lần đo ${v + 1}` }} aria-label="Lần đo đang xem" />
          <Segmented size="small" options={PACES} value={pace} onChange={setPace} aria-label="Tốc độ phát" />
        </div>
      </div>
      <div className="min-w-0 lg:col-span-6">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-gray-500">
          <span>
            Lần đo <span className="tabular-nums text-gray-700">{index + 1}</span> trên <span className="tabular-nums">{readings.length}</span>
          </span>
          {r?.at && <span className="tabular-nums">lúc {dayjs(r.at).format('HH:mm:ss')}</span>}
        </div>
        <Telemetry heartRate={r?.hr} heartRateMax={target.heartRateMax} speed={r?.speed} targetSpeed={target.speed} distance={r?.distance ?? 0} targetDistance={target.distance} />
        <div className="mt-3 text-xs text-gray-500">Nhịp tim (bpm), vạch đỏ là giới hạn</div>
        <RunLine data={data} dataKey="hr" unit="bpm" label="Nhịp tim" target={target.heartRateMax} index={index} onPick={goTo} />
        <div className="mt-2 text-xs text-gray-500">Tốc độ (km/h){target.speed ? ', vạch đỏ là mục tiêu' : ''}</div>
        <RunLine data={data} dataKey="speed" unit="km/h" label="Tốc độ" target={target.speed} index={index} onPick={goTo} />
        <Text type="secondary" className="!text-[11px] block mt-1">
          Bấm vào biểu đồ để tới lần đo đó. Cảm biến gửi một lần đo mỗi 5 giây.
        </Text>
      </div>
    </div>
  );
}

/**
 * A finished run played back (TrainingSession.trace, kept since 26/10/2026): the horse in 3D runs it
 * again reading by reading — tiring or going lame where it did, on the plan's surface under the sky
 * of its hour — beside its heart rate and speed over the run. `horse` gives its coat, `plan` its track.
 */
export default function SessionReplay({ session, horse, plan, onClose }) {
  const id = session?._id;
  const { data: readings, isLoading, isError, refetch } = useQuery({
    queryKey: ['session-replay', id],
    queryFn: () => trainingSessionApi.readings(id).then((res) => res?.data || []),
    enabled: Boolean(id),
    staleTime: Infinity,
  });
  const kind = SESSION_KINDS[session?.kind]?.label || OBJECTIVE_LABELS[session?.objective] || 'Buổi tập';
  const when = session ? dayjs(session.actualStartAt || session.scheduledAt).format('DD/MM, HH:mm') : '';

  return (
    <Modal open={Boolean(session)} onCancel={onClose} footer={null} width={980} destroyOnHidden title={session ? `Xem lại buổi chạy: ${session.horse?.name || 'Ngựa'}, ${kind.toLowerCase()} ${when}` : ''}>
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spin />
        </div>
      ) : isError ? (
        <Empty description="Chưa tải được số đo của buổi này.">
          <Button onClick={() => refetch()}>Thử lại</Button>
        </Empty>
      ) : (readings || []).length < 2 ? (
        <Empty description="Buổi này không lưu số đo từng lần nên không xem lại được: buổi nhập số tay, hoặc chạy trước ngày 26/10/2026." />
      ) : (
        <ReplayBody key={id} session={session} readings={readings} horse={horse} plan={plan} />
      )}
    </Modal>
  );
}
