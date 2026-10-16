import { useState } from 'react';
import { Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { PHASE_LABELS, PHASE_SHORT, PHASE_COLORS, PHASE_DESCRIPTIONS } from './trainingVocab';

const { Text } = Typography;
const DAY_MS = 24 * 60 * 60 * 1000;
// Same DD/MM as the wizard's phase table, whatever the browser's locale formatting does.
const ddmm = (d) => dayjs(d).format('DD/MM');
/** Text on a phase segment: dark on the light phase colours, white on the dark ones, readable on each. */
const inkOn = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? '#10261E' : '#FFFFFF';
};

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
                className="flex items-center justify-center overflow-hidden whitespace-nowrap px-1 text-[11px] font-medium"
                style={{ width: `${(p.weeks / laid.reduce((n, x) => n + x.weeks, 0)) * 100}%`, background: PHASE_COLORS[p.key], color: inkOn(PHASE_COLORS[p.key]), borderRight: i < laid.length - 1 ? '2px solid rgba(255,255,255,0.7)' : 'none' }}
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
            <div className="absolute -top-3.5 flex items-center justify-center leading-none" style={{ left: pos(race), transform: 'translateX(-50%)' }} aria-label="Ngày đua">
              <svg className="w-3.5 h-3.5 text-amber-600 drop-shadow-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
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
