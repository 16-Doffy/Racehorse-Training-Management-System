import { Tag, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { formFigures } from './trainingVocab';
import { useClubPolicy } from './useClubPolicy';

const FORM_COLORS = { ready: 'green', on_track: 'blue', not_ready: 'orange', blocked: 'red', pending: 'default' };

/** The plan's verdict on the horse's form for its race (server training/raceForm.js); why, on hover. */
export function RaceFormTag({ form }) {
  if (!form) return null;
  const reasons = Array.isArray(form.reasons) ? form.reasons : [];
  return (
    <Tooltip title={[...reasons, formFigures(form)].filter(Boolean).join(' ')}>
      <Tag color={FORM_COLORS[form.status]} className="!m-0 w-fit font-medium">
        {form.label}
      </Tag>
    </Tooltip>
  );
}

const FORM_DOTS = { ready: 'bg-emerald-600', on_track: 'bg-blue-500', not_ready: 'bg-amber-500', blocked: 'bg-rose-600', pending: 'bg-gray-300' };

/** The verdict as a dot beside a horse's name where a row has no room for a tag; the words on hover or focus. */
export function RaceFormDot({ form }) {
  if (!form) return null;
  const reasons = Array.isArray(form.reasons) ? form.reasons : [];
  const words = `Phong độ dự giải: ${form.label}`;
  return (
    <Tooltip title={[`${words}.`, ...reasons, formFigures(form)].filter(Boolean).join(' ')} trigger={['hover', 'focus']}>
      <span tabIndex={0} role="img" aria-label={words} className={`inline-block h-2 w-2 shrink-0 cursor-help rounded-full ${FORM_DOTS[form.status] || FORM_DOTS.pending}`} />
    </Tooltip>
  );
}

/**
 * The verdict for a plan card, in a line or two: the verdict, its numbers, then why when it is not
 * ready. The club's rule is behind the "?" instead of repeated on every card.
 */
export function RaceFormBlock({ form }) {
  const policy = useClubPolicy();
  if (!form) return null;
  const reasons = Array.isArray(form.reasons) ? form.reasons : [];
  const pct = (share) => `${Math.round(share * 100)}%`;
  const byPhases = Array.isArray(form.phases) && form.phases.length > 0;
  const rule = byPhases
    ? `Theo quy định CLB: ngựa phải được HLV đánh giá hoàn thành lần lượt từng giai đoạn (Nền tảng → Sức mạnh → Tốc độ), không nhảy bậc — mỗi giai đoạn cần tập từ ${pct(policy.raceFormMinDone)} số buổi, đạt chỉ tiêu từ ${pct(policy.raceFormMinMet)}, điểm HLV TB từ ${policy.raceFormMinAvgRating}/10; sau đó chạy thử cho giải đạt và bác sĩ không khóa tập.`
    : `Theo quy định CLB: tập từ ${pct(policy.raceFormMinDone)} số buổi đến hạn, đạt chỉ tiêu từ ${pct(policy.raceFormMinMet)} số buổi đã tập, điểm đánh giá HLV TB từ ${policy.raceFormMinAvgRating}/10, chạy thử cho giải đạt, bác sĩ không khóa tập.`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-semibold text-gray-900">Điều kiện & phong độ dự giải</span>
        <Tooltip title={rule} trigger={['hover', 'focus']}>
          <span tabIndex={0} role="img" aria-label={rule} className="cursor-help text-[11px] text-gray-400">
            <QuestionCircleOutlined />
          </span>
        </Tooltip>
        <RaceFormTag form={form} />
        <span className="text-xs tabular-nums text-gray-600">{formFigures(form)}</span>
      </div>
      {Array.isArray(form.checks) && form.checks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {form.checks.map((c) => {
            const cls =
              c.ok === true
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : c.ok === false
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-gray-200 bg-gray-100 text-gray-700';
            const icon = c.ok === true ? '✓' : c.ok === false ? '✗' : '•';
            return (
              <span key={c.key} className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] leading-tight ${cls}`}>
                <span aria-hidden="true">{icon}</span>
                <span className="font-medium">{c.label}:</span>
                <span className="tabular-nums">{c.detail}</span>
              </span>
            );
          })}
        </div>
      )}
      {reasons.length > 0 && <p className={`m-0 text-xs leading-snug ${form.status === 'blocked' ? 'text-rose-700' : 'text-amber-700'}`}>{reasons.join(' ')}</p>}
    </div>
  );
}
