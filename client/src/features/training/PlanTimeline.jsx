import { useState } from 'react';
import { Tooltip } from 'antd';
import dayjs from 'dayjs';
import { PHASE_LABELS, PHASE_SHORT, PHASE_COLORS, PHASE_DESCRIPTIONS } from './trainingVocab';

const DAY_MS = 24 * 60 * 60 * 1000;
const INK = '#10261E';
const GOLD = '#B7791F';
// Same DD/MM as the wizard's phase table, whatever the browser's locale formatting does.
const ddmm = (d) => dayjs(d).format('DD/MM');
/** Text on a phase segment: dark on the light phase colours, white on the dark ones, readable on each. */
const inkOn = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? INK : '#FFFFFF';
};
// A pill near either end of the bar is held inside it rather than centred on its point.
const pillAt = (percent) => (percent < 8 ? { left: 0 } : percent > 92 ? { right: 0 } : { left: `${percent}%`, transform: 'translateX(-50%)' });

/**
 * A plan's phases as one bar, each segment as long as its days, named; where the horse is today stands
 * out — the weeks behind it shaded, the phase it is in ringed, a marker with "Hôm nay" and the date — and
 * race day is flagged with its date. `phases` need startDate/endDate (from the server) or are laid out
 * from `startDate`. `compact`: a shorter bar without the dates under it; `mini`: a bar for a table cell,
 * today and race day as marks only.
 */
export default function PlanTimeline({ phases = [], startDate, raceDate, compact = false, mini = false }) {
  const [now] = useState(() => Date.now());
  if (!phases.length) return null;
  const first = new Date(startDate || phases[0].startDate).setHours(0, 0, 0, 0);
  const laid = phases.reduce((list, p) => {
    const days = Math.max(1, p.weeks * 7 + (p.extraDays || 0));
    const start = p.startDate ? new Date(p.startDate).getTime() : list.length ? list[list.length - 1].end + 1 : first;
    const end = p.endDate ? new Date(p.endDate).getTime() : start + days * DAY_MS - 1;
    return [...list, { ...p, start, end, days }];
  }, []);
  const from = laid[0].start;
  const to = laid[laid.length - 1].end;
  const span = to - from;
  const percent = (t) => Math.min(100, Math.max(0, ((t - from) / span) * 100));
  const race = raceDate ? new Date(raceDate).getTime() : null;
  const running = now >= from && now <= to;
  const raceShown = race && race >= from && race <= to;
  const totalDays = laid.reduce((n, x) => n + x.days, 0);
  const height = mini ? 18 : compact ? 28 : 32;

  return (
    <div className="w-full">
      {/* Race day, over the bar. */}
      {!mini && raceShown && (
        <div className="relative mb-1 h-5">
          <span
            className="absolute inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-semibold leading-5 text-white"
            style={{ ...pillAt(percent(race)), background: GOLD }}
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
            Đua {ddmm(race)}
          </span>
        </div>
      )}

      <div className="relative">
        <div className="flex w-full overflow-hidden rounded-md" style={{ height }}>
          {laid.map((p, i) => {
            const current = running && now >= p.start && now <= p.end;
            const extra = p.extraDays ? ` ${p.extraDays > 0 ? '+' : ''}${p.extraDays}n` : '';
            return (
              <Tooltip
                key={`${p.key}-${i}`}
                title={
                  <div>
                    <div className="font-semibold">
                      {PHASE_LABELS[p.key]}
                      {current ? ' · đang ở giai đoạn này' : ''}
                    </div>
                    <div>
                      {p.weeks} tuần{p.extraDays ? ` ${p.extraDays > 0 ? '+' : ''}${p.extraDays} ngày` : ''} · {ddmm(p.start)} – {ddmm(p.end)}
                    </div>
                    {p.extraDays > 0 && <div className="opacity-80">Kéo dài do ngựa nghỉ bệnh hoặc tập thêm sau đánh giá.</div>}
                    {p.extraDays < 0 && <div className="opacity-80">Rút ngắn để kịp ngày đua.</div>}
                    <div className="opacity-80">{PHASE_DESCRIPTIONS[p.key]}</div>
                  </div>
                }
              >
                <div
                  className="relative flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap px-1.5 text-[11px]"
                  style={{
                    width: `${(p.days / totalDays) * 100}%`,
                    background: PHASE_COLORS[p.key],
                    color: inkOn(PHASE_COLORS[p.key]),
                    borderRight: i < laid.length - 1 ? '2px solid rgba(255,255,255,0.75)' : 'none',
                    fontWeight: current ? 700 : 500,
                    // The phase the horse is in, ringed.
                    boxShadow: current ? `inset 0 0 0 2.5px ${INK}` : undefined,
                  }}
                >
                  {!mini && <span className="truncate">{`${PHASE_SHORT[p.key]} · ${p.weeks}t${extra}`}</span>}
                </div>
              </Tooltip>
            );
          })}
        </div>
        {running && (
          <>
            {/* The weeks already behind the horse, shaded. */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 rounded-l-md"
              style={{
                width: `${percent(now)}%`,
                background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.38) 0 5px, rgba(255,255,255,0.12) 5px 10px)',
              }}
            />
            {/* Today: a marker across the bar. */}
            <div
              className="pointer-events-none absolute"
              style={{ left: `${percent(now)}%`, top: -4, bottom: -4, width: 3, marginLeft: -1.5, background: INK, borderRadius: 2, boxShadow: '0 0 0 1.5px #fff' }}
            />
          </>
        )}
        {mini && raceShown && (
          <div className="pointer-events-none absolute" style={{ left: `${percent(race)}%`, top: -3, bottom: -3, width: 2, marginLeft: -1, background: GOLD }} />
        )}
      </div>

      {!mini && (running || !compact) && (
        <div className="relative mt-1.5 h-5 text-[11px] tabular-nums text-gray-500">
          {!compact && (
            <>
              <span className="absolute left-0 leading-5">{ddmm(from)}</span>
              <span className="absolute right-0 leading-5">{ddmm(to)}</span>
            </>
          )}
          {running && (
            <span
              className="absolute z-[1] inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 font-semibold leading-5 text-white"
              style={{ ...pillAt(percent(now)), background: INK }}
            >
              ▲ Hôm nay {ddmm(now)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
