/**
 * A dashboard card with nothing waiting: one slim line with its title and that all is well, instead
 * of an empty box as tall as a busy one.
 */
export default function QuietCard({ title, children }) {
  return (
    <section aria-label={title} className="light-surface-box flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-[#E5DEC9] bg-[#FFFDF8] px-4 py-2.5 shadow-xs">
      <span className="text-[15px] font-semibold text-gray-900">{title}</span>
      <span className="text-xs text-emerald-700">{children}</span>
    </section>
  );
}
