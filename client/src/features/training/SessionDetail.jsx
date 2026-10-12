import { Typography } from 'antd';
import { CheckOutlined, CloseOutlined, PlayCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { SESSION_KINDS, OBJECTIVE_LABELS, ABORT_CATEGORY_LABELS, DONE_STATUSES } from './trainingVocab';
import { SESSION_STATUS_LABELS } from './sessionStatus';
import { buildRows } from './sessionResult';

const { Text } = Typography;

const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
// Status pill: soft background, darker text; done work green, stopped work orange, the rest neutral.
const STATUS_TONE = {
  scheduled: 'bg-gray-100 text-gray-600',
  ready: 'bg-cyan-50 text-cyan-700',
  blocked: 'bg-amber-50 text-amber-700',
  in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700',
  evaluated: 'bg-green-50 text-green-700',
  aborted: 'bg-orange-50 text-orange-700',
  cancelled: 'bg-red-50 text-red-700',
  missed: 'bg-gray-100 text-gray-600',
};
const ROW_LABELS = { speed: 'Tốc độ tối đa', heart: 'Nhịp tim TB', distance: 'Cự ly' };

const num = (n, digits = 0) => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: digits });
const clock = (d) => dayjs(d).format('HH:mm');
const minutes = (sec) => (sec < 60 ? `${Math.max(0, Math.round(sec))} giây` : `${Math.round(sec / 60)} phút`);

/** A small grey heading over one part of the card. */
function Section({ title, aside, children }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-gray-500">{title}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Label on the left, value on the right; one line each. */
function Facts({ items }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
      {items.filter(Boolean).map(([label, value]) => (
        <div key={label} className="contents">
          <span className="text-gray-500">{label}</span>
          <span className="text-right tabular-nums text-gray-900">{value}</span>
        </div>
      ))}
    </div>
  );
}

/** The prescription before the run: what the horse is asked to do. */
function plannedFacts(p = {}) {
  return [
    p.distanceM && ['Cự ly', p.reps > 1 ? `${p.reps} × ${num(p.distanceM)} m` : `${num(p.distanceM)} m`],
    p.reps > 1 && p.restMinutes ? ['Nghỉ giữa hiệp', `${p.restMinutes} phút`] : null,
    p.targetSpeedKmh && ['Tốc độ mục tiêu', `${num(p.targetSpeedKmh, 1)} km/h`],
    p.targetHeartRateMax && ['Nhịp tim tối đa', `${p.targetHeartRateMax} bpm`],
    p.durationMinutes && ['Thời lượng', `${p.durationMinutes} phút`],
  ];
}

/** Each target against what was measured; ticks only once the run has been closed normally. */
function ResultTable({ rows, judged }) {
  return (
    <div className="overflow-hidden rounded-md border border-black/5">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-black/[0.02] text-[11px] text-gray-500">
            <th className="px-2 py-1 text-left font-medium">Chỉ số</th>
            <th className="px-2 py-1 text-right font-medium">Mục tiêu</th>
            <th className="px-2 py-1 text-right font-medium">Thực tế</th>
            {judged && <th className="w-5" aria-label="Kết quả" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-black/5">
              <td className="whitespace-nowrap px-2 py-1 text-gray-600">{ROW_LABELS[r.key] || r.label}</td>
              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-gray-500">
                {r.target != null ? `${r.atLeast ? '' : '≤ '}${num(r.target, r.digits)} ${r.unit}` : '–'}
              </td>
              <td className={`whitespace-nowrap px-2 py-1 text-right font-medium tabular-nums ${judged && r.met === false ? 'text-red-600' : 'text-gray-900'}`}>
                {r.actual != null ? `${num(r.actual, r.digits)} ${r.unit}` : '–'}
              </td>
              {judged && (
                <td className="pr-2 text-center">
                  {r.met === true && <CheckOutlined className="text-green-600" aria-label="Đạt" />}
                  {r.met === false && <CloseOutlined className="text-red-600" aria-label="Chưa đạt" />}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What the trainer sees on clicking a session in the week calendar. Before the run: the plan and what
 * is holding it up. After it: when it really ran, each target against what was measured, and the
 * trainer's own evaluation. `notes` are status messages from the calendar (missed, blocked, the
 * pre-check rule), `actions` its buttons.
 */
export default function SessionDetail({ session, statusLabel, notes, actions }) {
  const kind = SESSION_KINDS[session.kind];
  const title = kind?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập';
  const at = dayjs(session.scheduledAt);
  const ran = Boolean(session.actualStartAt);
  const finished = DONE_STATUSES.includes(session.status) || session.status === 'aborted';
  const rows = buildRows(session);
  const judged = DONE_STATUSES.includes(session.status) && session.outcome?.met != null;
  const missedTargets = judged ? rows.filter((r) => r.met === false).map((r) => (ROW_LABELS[r.key] || r.label).toLowerCase()) : [];
  const evaluated = session.performanceRating != null || session.trainerComment || session.videoUrl;

  return (
    <div className="flex w-[min(340px,calc(100vw-48px))] flex-col gap-3">
      <header className="flex flex-col gap-0.5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[15px] font-semibold leading-tight text-gray-900">{title}</span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[session.status] || STATUS_TONE.scheduled}`}>
            {statusLabel || SESSION_STATUS_LABELS[session.status] || session.status}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {WEEKDAY[at.day()]}, {at.format('DD/MM')} · lịch {at.format('HH:mm')}
        </span>
        {session.raceEntry?.raceName && (
          <span className="text-xs text-gray-600">
            Chạy thử cho {session.raceEntry.raceName} ({dayjs(session.raceEntry.raceDate).format('DD/MM')})
          </span>
        )}
      </header>

      {ran && (
        <Section title="Thời gian thực tế">
          <Facts
            items={[
              ['Bắt đầu', clock(session.actualStartAt)],
              session.actualEndAt ? ['Kết thúc', clock(session.actualEndAt)] : ['Kết thúc', 'đang chạy'],
              session.actualEndAt && ['Thời lượng', minutes(session.actualDurationSec || 0)],
              session.simulatedWorkSec ? ['Vận động (mô phỏng)', minutes(session.simulatedWorkSec)] : null,
            ]}
          />
        </Section>
      )}

      {finished && rows.length > 0 ? (
        <Section
          title="Kết quả"
          aside={
            judged && (
              <span className={`text-xs font-medium ${session.outcome.met ? 'text-green-700' : 'text-red-600'}`}>
                {session.outcome.met ? 'Đạt mục tiêu' : `Chưa đạt: ${missedTargets.join(', ')}`}
              </span>
            )
          }
        >
          {session.status === 'aborted' && (
            <div className="rounded-md bg-orange-50 px-2 py-1.5 text-xs text-orange-800">
              <div className="font-medium">Dừng giữa chừng · {ABORT_CATEGORY_LABELS[session.abortCategory] || 'Lý do khác'}</div>
              {session.abortReason && <div className="mt-0.5">{session.abortReason}</div>}
            </div>
          )}
          <ResultTable rows={rows} judged={judged} />
        </Section>
      ) : (
        plannedFacts(session.prescription).some(Boolean) && (
          <Section title="Bài tập">
            <Facts items={plannedFacts(session.prescription)} />
          </Section>
        )
      )}

      {finished && (
        <Section title="Đánh giá của HLV">
          {evaluated ? (
            <div className="flex flex-col gap-1">
              {session.performanceRating != null && (
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-semibold tabular-nums text-gray-900">{session.performanceRating}</span>
                  <span className="text-xs text-gray-500">/ 10 điểm phong độ</span>
                </div>
              )}
              {session.trainerComment && <p className="m-0 text-[13px] leading-snug text-gray-700">{session.trainerComment}</p>}
              {session.videoUrl && (
                <a href={session.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs">
                  <PlayCircleOutlined /> Xem video buổi chạy
                </a>
              )}
            </div>
          ) : (
            <Text type="secondary" className="!text-xs">
              {session.status === 'aborted' ? 'Buổi dừng giữa chừng không chấm điểm.' : 'Chưa đánh giá.'}
            </Text>
          )}
        </Section>
      )}

      {session.coachNote && (
        <Section title="Dặn dò trước buổi">
          <p className="m-0 text-[13px] leading-snug text-gray-700">{session.coachNote}</p>
        </Section>
      )}

      {notes}
      {actions}
    </div>
  );
}
