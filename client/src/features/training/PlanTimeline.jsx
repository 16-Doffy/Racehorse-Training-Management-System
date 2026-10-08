import { useState } from 'react';
import { Tooltip, Typography } from 'antd';
import { PHASE_LABELS, PHASE_SHORT, PHASE_COLORS, PHASE_DESCRIPTIONS } from './trainingVocab';

const { Text } = Typography;
const DAY_MS = 24 * 60 * 60 * 1000;
const ddmm = (d) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

/**
 * A plan's phases as one bar, each segment as wide as its weeks, with a marker for today and a flag
 * on race day. `phases` need startDate/endDate (from the server) or are laid out from `startDate`.
 */
export default function PlanTimeline({ phases = [], startDate, raceDate, compact = false }) {
  const [now] = useState(() => Date.now());
  if (!phases.length) return null;
  const first = new Date(startDate || phases[0].startDate).setHours(0, 0, 0, 0);
  const laid = phases.reduce((list, p) => {
    const start = p.startDate ? new Date(p.startDate).getTime() : list.length ? list[list.length - 1].end + 1 : first;
    const end = p.endDate ? new Date(p.endDate).getTime() : start + p.weeks * 7 * DAY_MS - 1;
    return [...list, { ...p, start, end }];
  }, []);
  const from = laid[0].start;
  const to = laid[laid.length - 1].end;
  const span = to - from;
  const pos = (t) => `${Math.min(100, Math.max(0, ((t - from) / span) * 100))}%`;
  const race = raceDate ? new Date(raceDate).getTime() : null;

  return (
    <div className="w-full">
      <div className="relative">
        <div className="flex h-7 w-full overflow-hidden rounded-md">
          {laid.map((p, i) => (
            <Tooltip
              key={`${p.key}-${i}`}
              title={
                <div>
                  <div className="font-semibold">{PHASE_LABELS[p.key]}</div>
                  <div>
                    {p.weeks} tuần · {ddmm(p.start)} – {ddmm(p.end)}
                  </div>
                  <div className="opacity-80">{PHASE_DESCRIPTIONS[p.key]}</div>
                </div>
              }
            >
              <div
                className="flex items-center justify-center overflow-hidden whitespace-nowrap px-1 text-[11px] font-medium text-white"
                style={{ width: `${(p.weeks / laid.reduce((n, x) => n + x.weeks, 0)) * 100}%`, background: PHASE_COLORS[p.key], borderRight: i < laid.length - 1 ? '2px solid rgba(255,255,255,0.7)' : 'none' }}
              >
                {compact ? `${p.weeks}t` : `${PHASE_SHORT[p.key]} · ${p.weeks}t`}
              </div>
            </Tooltip>
          ))}
        </div>
        {now >= from && now <= to && (
          <Tooltip title={`Hôm nay ${ddmm(now)}`}>
            <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-gray-900" style={{ left: pos(now) }} />
          </Tooltip>
        )}
        {race && race >= from && race <= to && (
          <Tooltip title={`Ngày đua ${ddmm(race)}`}>
            <div className="absolute -top-3 text-sm leading-none" style={{ left: pos(race), transform: 'translateX(-50%)' }} aria-label="Ngày đua">
              🏁
            </div>
          </Tooltip>
        )}
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between">
          <Text type="secondary" className="!text-xs">
            {ddmm(from)}
          </Text>
          <Text type="secondary" className="!text-xs">
            {ddmm(to)}
          </Text>
        </div>
      )}
    </div>
  );
}
