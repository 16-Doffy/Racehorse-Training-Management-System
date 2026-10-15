import React from 'react';
import loginBg from '../../assets/login-bg.jpg';

/**
 * Reusable Atmospheric Equestrian Hero Banner for Team 8 WDP301
 * Used across all Head Trainer and Club Manager pages to provide consistent luxury equestrian branding.
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

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1.5 drop-shadow-sm" style={{ fontFamily: "'Lora', Georgia, serif" }}>
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

