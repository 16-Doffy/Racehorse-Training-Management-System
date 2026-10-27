import React from 'react';
import { useSelector } from 'react-redux';
import loginBg from '../../assets/login-bg.jpg';
import { ROLES } from '../../constants/roles';

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
  className = '',
}) {
  const userRole = useSelector((state) => state.auth?.user?.role);
  const isStaff = userRole === ROLES.MANAGER || userRole === ROLES.HEAD_TRAINER;

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
      className={`rounded-xl border border-[#1E4638] border-l-4 border-l-[#D4AF37] bg-[#0B241B] px-4 py-3 sm:px-5 text-white mb-4 shadow-xs ${className}`}
    >
      {/* Wraps instead of squeezing: the title keeps 280px, the counts and the actions move to the next line. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
        <div className="min-w-0 flex-[1_1_280px]">
          <h1
            className="!m-0 !text-xl sm:!text-[22px] !leading-tight font-semibold tracking-tight text-balance text-[#FAF8F5]"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            {title}
          </h1>
          {subtitle && <p className="m-0 mt-0.5 hidden max-w-2xl text-xs leading-snug text-[#C3D4CA] sm:block">{subtitle}</p>}
        </div>

        {stats.length > 0 && (
          <dl className="m-0 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs">
            {stats.map((stat, idx) => (
              <div key={idx} className="flex items-baseline gap-1.5">
                <dt className="text-[#A7C4B5]">{stat.label}</dt>
                <dd className="m-0 font-semibold tabular-nums text-[#FAF8F5]">{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {(statusBadge || actionButton) && (
          // Wraps on a phone, where the badge and the button do not fit side by side.
          <div className="ml-auto flex max-w-full flex-wrap items-center gap-3">
            {statusBadge}
            {actionButton}
          </div>
        )}
      </div>
    </div>
  );
}
