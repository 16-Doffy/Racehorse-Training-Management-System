import React from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import loginBg from '../../assets/login-bg.jpg';
import { ROLES } from '../../constants/roles';

// Contextual subtitle per staff route when a page does not supply a custom subtitle.
const ROUTE_NOTES = {
  '/horses': 'Hồ sơ đàn ngựa dùng chung cho Quản lý, HLV, Bác sĩ thú y, Nhân viên chuồng và Chủ ngựa.',
  '/stable/tasks': 'Giao việc chăm sóc tới App Groom, đồng bộ khẩu phần theo giai đoạn tập và tiếp nhận sự cố chuồng.',
  '/races': 'Đăng ký giải đấu dựa trên sức khỏe do Bác sĩ duyệt, chốt kèo chạy thử trước khi vào giải chính.',
  '/training/plans': 'Thiết kế lộ trình phân kỳ theo cự ly giải, đồng bộ giới hạn tập luyện từ Bác sĩ.',
  '/training/sessions': 'Xếp lịch theo khung giờ bắt đầu–kết thúc, ghép bài tập, kiểm tra 4 cổng và theo dõi cảm biến trực tiếp.',
  '/admin/users': 'Duyệt tài khoản mới và phân vai trò: Quản lý, HLV Trưởng, Bác sĩ thú y, Nhân viên chuồng (Mobile) và Chủ ngựa.',
  '/admin/stables': 'Bố trí sơ đồ chuồng trại theo tình trạng y tế và phân công nhân viên chăm sóc phụ trách từng ngựa.',
  '/admin/reports': 'Tổng hợp kết quả huấn luyện từ HLV và cân đối chi phí vận hành — thưởng giải tự động.',
  '/inventory': 'Quản lý lô nhập, hạn sử dụng FEFO, duyệt đề xuất vật tư từ Bác sĩ / Groom và tiêu hủy hàng quá hạn.',
  '/finance': 'Sổ thu chi cấp CLB: nhận tự động tiền thưởng giải và ghi nhận chi phí vận hành đồng bộ sang Chủ ngựa.',
  '/admin/audit-logs': 'Theo dõi toàn bộ thao tác quan trọng của các vai trò để kiểm soát vận hành minh bạch.',
};

/**
 * Reusable Hero Banner for WDP301 Racehorse TMS.
 * - Head Trainer & Club Manager: Split Command Header Card with left gold accent bar,
 *   crisp high-contrast title/subtitle, action cluster, and framed KPI strip.
 * - Horse Owner & other roles: preserves the original atmospheric banner untouched.
 */
export default function PageHeroBanner({
  eyebrow = 'CÂU LẠC BỘ ĐUA NGỰA',
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
  const { pathname } = useLocation();
  const fallbackSubtitle = isStaff ? ROUTE_NOTES[pathname] : null;

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

  return (
    <header className={`st-hero-banner ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-[1_1_320px]">
          <div className="st-hero-banner__eyebrow">
            <span>{roleLabel || (userRole === ROLES.HEAD_TRAINER ? 'Huấn luyện viên Trưởng' : 'Quản lý Câu lạc bộ')}</span>
          </div>
          <h1 className="!m-0 !leading-tight text-balance">
            {title}
          </h1>
          {(subtitle || fallbackSubtitle) && (
            <p className="st-hero-banner__subtitle m-0 mt-1 max-w-3xl">
              {subtitle || fallbackSubtitle}
            </p>
          )}
        </div>

        {(statusBadge || actionButton) && (
          <div className="ml-auto flex max-w-full flex-wrap items-center gap-2.5 shrink-0">
            {statusBadge}
            {actionButton}
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <dl className="st-hero-banner__stats">
          {stats.map((stat, idx) => (
            <div key={idx} className="st-hero-stat-cell">
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
