import { Tag, Typography } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, StarFilled, PlayCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

const OK = '#389e0d';
const MISS = '#d4380d';

const round = (n, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/**
 * One line per target the session was given, each with what was actually measured. Mirrors the
 * rules the server uses to decide `outcome.met` (trainingSession.controller.js computeOutcome):
 * speed and distance must reach the target, heart rate must stay under it.
 */
function buildRows(session) {
  const p = session.prescription || {};
  const m = session.metrics || {};
  const rows = [
    { key: 'speed', label: 'Tốc độ', actual: m.maxSpeed, target: p.targetSpeedKmh, unit: 'km/h', digits: 1, atLeast: true },
    { key: 'heart', label: 'Nhịp tim', actual: m.avgHeartRate, target: p.targetHeartRateMax, unit: 'bpm', digits: 0, atLeast: false },
    // Every rep counts: the target of 3 × 1200 m is 3600 m.
    { key: 'distance', label: 'Cự ly', actual: m.distance, target: p.distanceM != null ? p.distanceM * (p.reps || 1) : undefined, unit: 'm', digits: 0, atLeast: true },
  ];
  return rows
    .filter((r) => r.actual != null || r.target != null)
    .map((r) => ({
      ...r,
      met: r.actual != null && r.target != null ? (r.atLeast ? r.actual >= r.target : r.actual <= r.target) : null,
    }));
}

function MetricRow({ row, judged }) {
  const hasActual = row.actual != null;
  const color = judged && row.met === false ? MISS : undefined;
  return (
    <>
      <span className="flex items-center" style={{ color: row.met ? OK : MISS }}>
        {judged && row.met === true && <CheckCircleFilled />}
        {judged && row.met === false && <CloseCircleFilled />}
      </span>
      <span className="text-gray-500">{row.label}</span>
      <span className="tabular-nums whitespace-nowrap">
        <span className="font-semibold" style={{ color }}>
          {hasActual ? round(row.actual, row.digits) : '—'}
        </span>
        {row.target != null && (
          <span className="text-gray-400">
            {' '}
            / {row.atLeast ? '' : '≤ '}
            {row.target}
          </span>
        )}
        <span className="text-gray-400"> {row.unit}</span>
      </span>
    </>
  );
}

/**
 * The "Kết quả" cell of the session list: verdict first, then each target against what was
 * measured, so a missed session shows at a glance *which* target it missed instead of making the
 * reader parse a sentence.
 */
export default function SessionOutcome({ session }) {
  const { status, outcome, performanceRating, videoUrl } = session;

  if (status === 'cancelled') return <Text type="secondary" className="!text-xs">Buổi tập đã hủy</Text>;
  if (status === 'missed') return <Text type="secondary" className="!text-xs">Lỡ giờ — không chạy</Text>;
  if (status === 'scheduled') return <Text type="secondary" className="!text-xs">Chưa diễn ra</Text>;

  const rows = buildRows(session);
  const hasTargets = rows.some((r) => r.target != null);
  // Rows are only ticked/crossed once the session is finished; mid-session numbers are still moving.
  const done = status === 'completed' || status === 'evaluated';
  const judged = done && outcome?.met != null;

  return (
    <div className="min-w-[210px]">
      <div className="flex items-center gap-2 mb-1.5">
        {status === 'in_progress' && <Tag color="processing" className="!m-0">Đang đo</Tag>}
        {status === 'aborted' && (
          <Tag color="volcano" className="!m-0">
            Dừng giữa chừng{session.abortReason ? `: ${session.abortReason}` : ''}
          </Tag>
        )}
        {done && judged && (
          <Tag color={outcome.met ? 'success' : 'error'} className="!m-0 !font-medium">
            {outcome.met ? 'Đạt mục tiêu' : 'Chưa đạt'}
          </Tag>
        )}
        {done && !judged && (
          <Text type="secondary" className="!text-xs">
            {hasTargets ? 'Chưa có số đo để đối chiếu' : 'Không đặt mục tiêu'}
          </Text>
        )}
        {performanceRating != null && (
          <span className="text-xs text-gray-600 whitespace-nowrap">
            <StarFilled style={{ color: '#eab308' }} /> {performanceRating}/10
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-[14px_auto_1fr] gap-x-2 gap-y-0.5 text-xs items-center">
          {rows.map((row) => (
            <MetricRow key={row.key} row={row} judged={judged} />
          ))}
        </div>
      )}

      {videoUrl && (
        <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs mt-1.5">
          <PlayCircleOutlined /> Xem video
        </a>
      )}
    </div>
  );
}
