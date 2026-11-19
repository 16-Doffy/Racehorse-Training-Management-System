import { Tag, Typography } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, StarFilled, PlayCircleOutlined } from '@ant-design/icons';

import { buildRows } from './sessionResult';

const { Text } = Typography;

const OK = '#389e0d';
const MISS = '#d4380d';

const round = (n, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

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
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        {status === 'in_progress' && <Tag color="processing" className="!m-0">Đang đo</Tag>}
        {status === 'aborted' && (
          <Tag color="volcano" className="!m-0 !whitespace-normal">
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

      {Array.isArray(outcome?.segmentResults) && outcome.segmentResults.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 border-t border-gray-100 pt-1.5 text-[11px]">
          {outcome.segmentResults.map((sr, i) => (
            <div key={`${sr.kind}-${i}`} className="flex flex-wrap items-center justify-between gap-1.5 text-gray-600">
              <span className="font-medium text-gray-800">
                #{i + 1} {sr.label || sr.kind}
                {sr.recoveryDropBpm > 0 ? <span className="ml-1 text-emerald-700">(hạ -{sr.recoveryDropBpm} bpm)</span> : null}
              </span>
              <span className="tabular-nums">
                {sr.kind !== 'walk' && sr.actualMaxSpeedKmh != null ? `${sr.actualMaxSpeedKmh} km/h · ` : ''}
                {sr.actualAvgHeartRate != null ? `${Math.round(sr.actualAvgHeartRate)} bpm ` : ''}
                {sr.met === true && <span className="font-semibold text-emerald-700">✓ Đạt</span>}
                {sr.met === false && <span className="font-semibold text-rose-600">✗ Chưa đạt</span>}
              </span>
            </div>
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
