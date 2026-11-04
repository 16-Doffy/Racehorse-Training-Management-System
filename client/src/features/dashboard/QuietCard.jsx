import { CheckCircleFilled } from '@ant-design/icons';

/**
 * A dashboard card with nothing waiting: stretches uniformly with its grid row so there are
 * no uneven card heights ("bảng cao bảng thấp").
 */
export default function QuietCard({ title, children }) {
  return (
    <section
      aria-label={title}
      className="st-quiet-card light-surface-box flex h-full flex-col justify-between rounded-xl border px-4 py-3.5 shadow-xs"
      style={{ background: 'var(--st-surface)', borderColor: 'var(--st-border)' }}
    >
      <div className="flex items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: 'var(--st-border)' }}>
        <span className="text-[14.5px] font-bold text-gray-900">{title}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
          <CheckCircleFilled className="text-[10px]" /> Ổn định
        </span>
      </div>
      <div className="flex items-center gap-2 pt-2.5 text-xs font-medium text-emerald-700">
        <span>{children}</span>
      </div>
    </section>
  );
}
