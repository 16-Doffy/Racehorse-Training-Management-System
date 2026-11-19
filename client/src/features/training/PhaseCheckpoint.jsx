import { useState } from 'react';
import { Alert, Button, Input, Popconfirm, Tooltip } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { message } from '../../lib/antdStatic';
import { trainingPlanApi } from './trainingApi';
import { PHASE_LABELS } from './trainingVocab';

const ddmm = (d) => dayjs(d).format('DD/MM');
const label = (key) => PHASE_LABELS[key] || key;

/**
 * The plan stopped by the vet (server: training/planProgress.service.js): since when, why, and what
 * happens once the horse is back — the phase runs as many days longer, or the horse leaves its race.
 */
export function PlanPauseNotice({ plan }) {
  const pause = plan.pause;
  if (!pause?.since) return null;
  const phase = plan.phases?.[pause.phaseIndex];
  const days = Math.max(0, dayjs().startOf('day').diff(dayjs(pause.since).startOf('day'), 'day'));
  return (
    <Alert
      type="error"
      showIcon
      icon={<PauseCircleOutlined />}
      title={`Tạm dừng từ ${ddmm(pause.since)}${days ? ` · đã nghỉ ${days} ngày` : ''}${phase ? ` · giai đoạn ${label(phase.key)}` : ''}`}
      description={
        <span className="text-xs leading-snug">
          {pause.reason} Khi bác sĩ cho tập lại, giai đoạn này kéo dài thêm số ngày đã nghỉ (nghỉ trên 2 tuần thêm thời gian lấy lại thể lực), các giai đoạn sau lùi theo. Không còn kịp ngày đua thì ngựa tự rút khỏi giải.
        </span>
      }
    />
  );
}

const CHECK_TONE = {
  true: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  false: 'border-rose-200 bg-rose-50 text-rose-800',
  null: 'border-gray-200 bg-gray-100 text-gray-700',
};

/**
 * The current phase's end-of-phase checkpoint (progress.checkpoint): what it judges, how the phase stands
 * on it so far, and — in its last days or while it runs a week more — the trainer's call: "phase done"
 * (only once its marks are met) or a week more. Only the trainer moves the horse on: a phase that ends
 * without their "done" runs a week more (server planProgress.service.js), so no phase is skipped.
 */
export function PhaseCheckBlock({ plan }) {
  const check = plan.progress?.checkpoint;
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: (decision) => trainingPlanApi.checkpoint(plan._id, { decision, note }),
    onSuccess: (res, decision) => {
      const data = res?.data || {};
      message[data.withdrawn ? 'warning' : 'success'](
        decision === 'pass'
          ? `Đã đánh giá hoàn thành ${label(check.phaseKey)}: sang giai đoạn ${label(check.nextKey)} từ ngày mai.`
          : `Giai đoạn ${label(check.phaseKey)} tập thêm 7 ngày.${data.withdrawn ? ' Không còn kịp ngày đua: ngựa đã được rút khỏi giải.' : ''}`
      );
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['races'] });
    },
    onError: (err) => message.error(err.message || 'Không lưu được đánh giá.'),
  });
  if (!check) return null;
  const when = check.daysLeft === 0 ? 'hôm nay' : `${ddmm(check.endDate)} · còn ${check.daysLeft} ngày`;
  const opensOn = dayjs(check.endDate).subtract(2, 'day');

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-xs font-semibold text-gray-900">
          Đánh giá hoàn thành giai đoạn {label(check.phaseKey)} → {label(check.nextKey)}
        </span>
        <span className="text-[11px] tabular-nums text-gray-500">
          <ClockCircleOutlined className="mr-1" />
          {when}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(check.checks || []).map((c) => (
          <span key={c.key} className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] leading-tight ${CHECK_TONE[c.ok]}`}>
            <span aria-hidden="true">{c.ok === true ? '✓' : c.ok === false ? '✗' : '•'}</span>
            <span className="font-medium">{c.label}:</span>
            <span className="tabular-nums">{c.detail}</span>
          </span>
        ))}
      </div>
      <p className={`m-0 text-xs leading-snug ${check.pass || check.decided === 'passed' ? 'text-gray-600' : 'text-amber-700'}`}>
        {check.decided === 'passed'
          ? `HLV đã đánh giá hoàn thành: sang giai đoạn ${label(check.nextKey)} từ ngày mai.`
          : check.decided === 'failed'
            ? 'Không đạt — HLV xem lại kế hoạch.'
            : `${check.extensions > 0 ? `Đã tập thêm ${check.extensions} lần. ` : ''}${
                check.pass
                  ? `Đủ tiêu chí. Ngựa chỉ sang ${label(check.nextKey)} khi HLV bấm "Hoàn thành giai đoạn"; chưa đánh giá thì hết giai đoạn ngựa ở lại tập thêm 7 ngày.`
                  : `Chưa đạt tiêu chí: chưa được sang ${label(check.nextKey)}. Hết giai đoạn ngựa tập thêm 7 ngày; không còn kịp ngày đua thì ngựa tự rút khỏi giải.`
              }`}
      </p>
      {!check.canDecide && !check.decided && (
        <p className="m-0 text-[11px] text-gray-500">HLV đánh giá được trong 3 ngày cuối giai đoạn (từ {opensOn.format('DD/MM')}).</p>
      )}
      {check.canDecide && (
        <div className="flex flex-col gap-1.5 rounded-md border border-gray-200 bg-gray-50 p-2">
          <Input.TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={1} maxLength={300} placeholder="Nhận xét của HLV (không bắt buộc)" autoSize={{ minRows: 1, maxRows: 3 }} />
          <div className="flex flex-wrap gap-2">
            {check.pass ? (
              <Popconfirm title={`Xác nhận ngựa đã hoàn thành ${label(check.phaseKey)}? Từ ngày mai sang ${label(check.nextKey)}.`} okText="Hoàn thành" cancelText="Thôi" onConfirm={() => decide.mutate('pass')}>
                <Button size="small" type="primary" icon={<CheckCircleOutlined />} loading={decide.isPending && decide.variables === 'pass'}>
                  Hoàn thành giai đoạn
                </Button>
              </Popconfirm>
            ) : (
              <Tooltip title="Ngựa chưa đạt các tiêu chí của giai đoạn này — chưa thể sang giai đoạn sau (không nhảy bậc).">
                <Button size="small" type="primary" icon={<CheckCircleOutlined />} disabled>
                  Hoàn thành giai đoạn
                </Button>
              </Tooltip>
            )}
            <Popconfirm title={`Tập thêm 7 ngày ${label(check.phaseKey)}? Các giai đoạn sau lùi lại; không kịp ngày đua thì ngựa rút khỏi giải.`} okText="Tập thêm" cancelText="Thôi" onConfirm={() => decide.mutate('extend')}>
              <Button size="small" loading={decide.isPending && decide.variables === 'extend'}>
                Tập thêm 1 tuần
              </Button>
            </Popconfirm>
          </div>
        </div>
      )}
    </div>
  );
}

const RESULT_WORDS = { passed: 'HLV đánh giá hoàn thành, sang giai đoạn sau', extended: 'ở lại tập thêm', failed: 'không đạt' };

/** What moved the plan: the vet's stops and the end-of-phase checkpoints, oldest first. */
export function PlanJournal({ plan }) {
  const lines = [
    ...(plan.pauses || []).map((p) => ({
      at: p.until,
      text: `Nghỉ ${p.days} ngày (${ddmm(p.since)} – ${ddmm(p.until)})${p.addedDays ? ` · ${label(p.phaseKey)} +${p.addedDays} ngày` : ''}`,
      tone: 'text-rose-700',
    })),
    ...(plan.checkpoints || []).map((c) => ({
      at: c.at,
      text: `${label(c.phaseKey)}: ${RESULT_WORDS[c.result] || c.result}${c.result === 'extended' && c.extendedDays ? ` ${c.extendedDays} ngày` : ''}${c.auto ? '' : ' (HLV)'}${c.reasons?.length && c.result !== 'passed' ? ` — ${c.reasons.join('; ')}` : ''}${c.note ? ` · “${c.note}”` : ''}`,
      tone: c.result === 'passed' ? 'text-emerald-700' : c.result === 'failed' ? 'text-rose-700' : 'text-amber-700',
    })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!lines.length) return null;
  return (
    <ul className="m-0 mt-1.5 flex list-none flex-col gap-0.5 p-0 text-xs">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-2">
          <span className="shrink-0 tabular-nums text-gray-400">{ddmm(l.at)}</span>
          <span className={l.tone}>{l.text}</span>
        </li>
      ))}
    </ul>
  );
}
