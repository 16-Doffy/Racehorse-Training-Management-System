import { Tag, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useClubPolicy } from './useClubPolicy';

const FORM_COLORS = { ready: 'green', on_track: 'blue', not_ready: 'orange', blocked: 'red', pending: 'default' };
const TRIAL_WORDS = { passed: 'chạy thử đạt', ran: 'đã chạy thử', failed: 'chạy thử chưa đạt', missing: 'chưa chạy thử' };

/** "Tập 9/10 buổi đến hạn · đạt 8/9 · chạy thử 22/11": the numbers behind the verdict. */
function formFigures(form) {
  if (!form) return '';
  const parts = [`Tập ${form.done}/${form.due} buổi đến hạn`];
  if (form.rated) parts.push(`đạt chỉ tiêu ${form.met}/${form.rated}`);
  if (form.trial === 'ahead') parts.push(`chạy thử ${dayjs(form.trialDay).format('DD/MM')}`);
  else if (form.trial) parts.push(TRIAL_WORDS[form.trial]);
  return parts.join(' · ');
}

/** The plan's verdict on the horse's form for its race (server training/raceForm.js); why, on hover. */
export function RaceFormTag({ form }) {
  if (!form) return null;
  return (
    <Tooltip title={[...form.reasons, formFigures(form)].filter(Boolean).join(' ')}>
      <Tag color={FORM_COLORS[form.status]} className="!m-0 w-fit font-medium">
        {form.label}
      </Tag>
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
  const pct = (share) => `${Math.round(share * 100)}%`;
  const rule = `Theo quy định CLB: tập từ ${pct(policy.raceFormMinDone)} số buổi đến hạn, đạt chỉ tiêu từ ${pct(policy.raceFormMinMet)} số buổi đã tập, chạy thử cho giải đạt, bác sĩ không khóa tập.`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-semibold text-gray-900">Phong độ dự giải</span>
        <Tooltip title={rule} trigger={['hover', 'focus']}>
          <span tabIndex={0} role="img" aria-label={rule} className="cursor-help text-[11px] text-gray-400">
            <QuestionCircleOutlined />
          </span>
        </Tooltip>
        <RaceFormTag form={form} />
        <span className="text-xs tabular-nums text-gray-600">{formFigures(form)}</span>
      </div>
      {form.reasons.length > 0 && <p className={`m-0 text-xs leading-snug ${form.status === 'blocked' ? 'text-rose-700' : 'text-amber-700'}`}>{form.reasons.join(' ')}</p>}
    </div>
  );
}
