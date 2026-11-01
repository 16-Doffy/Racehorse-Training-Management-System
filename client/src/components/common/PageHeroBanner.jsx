import React from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import loginBg from '../../assets/login-bg.jpg';
import { ROLES } from '../../constants/roles';
import { getMenuByRole } from '../../layouts/menuConfig';

// What each step of the trainer's work is for, when the page says nothing itself.
const STEP_NOTES = {
  1: 'Rà soát ngựa được giao, kiểm tra tình trạng khám của bác sĩ và mục tiêu thi đấu.',
  2: 'Thiết lập dinh dưỡng từng bữa theo giai đoạn tập và giao việc chăm sóc dài hạn cho nhân viên.',
  3: 'Lấy kết quả chạy thử làm bằng chứng để quyết định tham gia hoặc rút lui an toàn.',
  4: 'Phân kỳ 4 giai đoạn: sức bền, sức mạnh, tốc độ, tinh chỉnh; tự sinh lịch tập tuần.',
  5: 'Vận hành lịch tuần, kiểm tra sẵn sàng 4 cổng, theo dõi trực tiếp và chấm điểm phong độ.',
};

/**
 * Reusable Hero Banner for Team 8 WDP301.
 * - Head Trainer & Club Manager: a compact one-band header (title, counts, actions), so the page's
 *   own work starts near the top.
 * - Horse Owner & other roles: preserves the original atmospheric banner untouched.
 */
export default function PageHeroBanner({
  eyebrow = 'TEAM 8 • WDP301 EQUESTRIAN TMS',
  roleLabel,
  title,
  subtitle,
  statusBadge,
  actionButton,
  stats = [],
  kicker,
  kickerNote,
  className = '',
}) {
  const userRole = useSelector((state) => state.auth?.user?.role);
  const isStaff = userRole === ROLES.MANAGER || userRole === ROLES.HEAD_TRAINER;
  const { pathname } = useLocation();
  // The trainer's pages are steps of one job (menuConfig): the header carries the step's number.
  const step = isStaff ? getMenuByRole(userRole).find((m) => m.step && m.path === pathname)?.step : null;

  if (!isStaff) {
    return (
      <div className={`relative rounded-2xl overflow-hidden border border-amber-500/25 shadow-md bg-gradient-to-r from-[#061812] via-[#0D2A20] to-[#261508] p-5 sm:p-6 text-white mb-6 ${className}`}>
        {/* Cinematic Backdrop with subtle blur and opacity */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-luminosity pointer-events-none"
          style={{ backgroundImage: `url(${loginBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {eyebrow}
              </span>
              {roleLabel && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                  {roleLabel}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance text-white mb-1.5 drop-shadow-sm" style={{ fontFamily: "'Lora', Georgia, serif" }}>
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-amber-100/80 mb-0 leading-relaxed">
                {subtitle}
              </p>
            )}

            {stats.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 mt-3 pt-2.5 border-t border-white/10 text-xs">
                {stats.map((stat, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-slate-300">
                    <span className="text-amber-300 font-semibold">{stat.label}:</span>
                    <span className="text-white font-bold tabular-nums font-mono">{stat.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right side actions and status badge */}
          {(statusBadge || actionButton) && (
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {statusBadge}
              {actionButton}
            </div>
          )}
        </div>
      </div>
    );
  }

  // One band: the title (its one-line description beside it from a tablet up), the counts on the same
  // line, the page's own actions on the right. The role and section are already in the sidebar, so the
  // staff header leaves out `roleLabel` and `eyebrow`. The heading's size is set with !: a global
  // heading style outside Tailwind's layer otherwise wins and makes it 40px.
  return (
    <div
      className={`st-hero-banner px-4 py-3.5 sm:px-5 mb-4 ${className}`}
      data-step={step || undefined}
    >
      {/* Wraps instead of squeezing: the title keeps 280px, the counts and the actions move to the next line. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
        {step && <span className="st-hero-step" aria-label={`Bước ${step}`}>{step}</span>}
        <div className="min-w-0 flex-[1_1_280px]">
          {step && <span className="st-hero-steplabel">Bước {step}</span>}
          {kicker && (
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="st-hero-kicker">{kicker}</span>
              {kickerNote && <span className="text-xs" style={{ color: 'var(--st-ink-secondary)' }}>{kickerNote}</span>}
            </div>
          )}
          <h1
            className={`!m-0 !leading-tight !font-extrabold tracking-tight text-balance ${kicker ? '!text-2xl lg:!text-3xl' : '!text-xl sm:!text-[22px]'}`}
            style={{ fontFamily: 'inherit', color: 'var(--st-ink)' }}
          >
            {title}
          </h1>
          {(subtitle || STEP_NOTES[step]) && (
            <p className="m-0 mt-0.5 hidden max-w-2xl text-xs leading-snug sm:block" style={{ color: 'var(--st-ink-secondary)' }}>
              {subtitle || STEP_NOTES[step]}
            </p>
          )}
        </div>

        {stats.length > 0 && (
          <dl className="m-0 flex flex-wrap items-center gap-2 text-xs">
            {stats.map((stat, idx) => (
              <div
                key={idx}
                className="inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1"
                style={{ background: 'var(--st-sunk)', borderColor: 'var(--st-border)' }}
              >
                <dt style={{ color: 'var(--st-ink-secondary)' }}>{stat.label}</dt>
                <dd className="m-0 font-semibold tabular-nums" style={{ color: 'var(--st-ink)' }}>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {(statusBadge || actionButton) && (
          // Wraps on a phone, where the badge and the button do not fit side by side.
          <div className="ml-auto flex max-w-full flex-wrap items-center gap-2.5">
            {statusBadge}
            {actionButton}
          </div>
        )}
      </div>
    </div>
  );
}
