import { Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useClubPolicy } from './useClubPolicy';

const { Text } = Typography;

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
      <Tag color={FORM_COLORS[form.status]} className="!m-0 w-fit">
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
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Text type="secondary" className="!text-xs font-medium">
          Phong độ dự giải
        </Text>
        <RaceFormTag form={form} />
      </div>
      <Text className="!text-sm tabular-nums">{formFigures(form)}</Text>
      {form.reasons.map((r) => (
        <Text key={r} type={form.status === 'blocked' ? 'danger' : 'warning'} className="!text-xs">
          {r}
        </Text>
      ))}
      <Text type="secondary" className="!text-[11px] leading-snug">
        Theo quy định CLB: tập từ {pct(policy.raceFormMinDone)} số buổi đến hạn, đạt chỉ tiêu từ {pct(policy.raceFormMinMet)} số buổi đã tập, chạy thử cho
        giải đạt, bác sĩ không khóa hay hạn chế. HLV vẫn là người quyết định dự giải.
      </Text>
    </div>
  );
}
