import { Tag, Tooltip } from 'antd';
import { TrophyOutlined, WarningFilled, CloseCircleFilled } from '@ant-design/icons';
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

/** The verdict with its numbers, reasons and the club's rule: for a plan card. */
export function RaceFormBlock({ form }) {
  const policy = useClubPolicy();
  if (!form) return null;
  const pct = (share) => `${Math.round(share * 100)}%`;
  const isBlocked = form.status === 'blocked';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TrophyOutlined className="text-amber-700 text-xs" />
          <span className="text-xs font-semibold text-gray-800">
            Phong độ dự giải
          </span>
        </div>
        <RaceFormTag form={form} />
      </div>

      <div className="p-2 rounded-lg bg-white/80 border border-[#E5DEC9] text-xs font-medium text-gray-800 tabular-nums shadow-2xs">
        {formFigures(form)}
      </div>

      {form.reasons.length > 0 && (
        <div className="space-y-1">
          {form.reasons.map((r) => (
            <div
              key={r}
              className={`text-xs px-2 py-1 rounded flex items-center gap-1.5 ${
                isBlocked
                  ? 'bg-rose-50 text-rose-800 border border-rose-200/80'
                  : 'bg-amber-50 text-amber-900 border border-amber-200/80'
              }`}
            >
              {isBlocked ? (
                <CloseCircleFilled className="text-rose-600 text-[11px] shrink-0" />
              ) : (
                <WarningFilled className="text-amber-600 text-[11px] shrink-0" />
              )}
              <span className="leading-snug">{r}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-500 m-0 leading-relaxed">
        Theo quy định CLB: tập từ {pct(policy.raceFormMinDone)} số buổi đến hạn, đạt chỉ tiêu từ {pct(policy.raceFormMinMet)} số buổi đã tập, chạy thử cho giải đạt, bác sĩ không khóa tập.
      </p>
    </div>
  );
}
